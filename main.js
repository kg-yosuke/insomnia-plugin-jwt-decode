const decodePart = part =>
  JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

const decodeJwt = token => {
  const [h, p] = String(token || '').trim().replace(/^Bearer\s+/i, '').split('.');
  if (!h || !p) {
    throw new Error('JWT形式ではありません');
  }
  return { header: decodePart(h), payload: decodePart(p) };
};

const fmtTime = sec => (sec ? new Date(sec * 1000).toLocaleString() : '-');

const fmtRemaining = sec => {
  if (!sec) {
    return '無期限';
  }
  const m = Math.floor((sec * 1000 - Date.now()) / 60000);
  return m >= 1440 ? `${Math.floor(m / 1440)}日` : m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`;
};

const looksLikeJwt = s => /^[\w-]+\.[\w-]+\.[\w-]*$/.test(String(s || '').trim().replace(/^Bearer\s+/i, ''));

// OAuth2で取得したトークンは request.authentication ではなく OAuth2Token モデルに保存される。
// 認証をフォルダから継承している場合はフォルダ側に保存されるので、近い順に探す。
const findOAuth2Token = async (context, field) => {
  const { requestId } = context.meta || {};
  if (!requestId) {
    throw new Error('リクエストの中で使ってください');
  }
  const models = context.util.models;
  const request = await models.request.getById(requestId);
  const ancestors = request ? await models.request.getAncestors(request) : [];
  for (const id of [requestId, ...ancestors.map(a => a._id)]) {
    const t = await models.oAuth2Token.getByRequestId(id);
    if (t?.[field]) {
      return t[field];
    }
  }
  throw new Error('OAuth2トークンがありません（Authタブで Fetch Tokens を実行してください）');
};

module.exports.decodeJwt = decodeJwt;

// 右クリックメニュー
module.exports.requestActions = [{
  label: 'Decode JWT',
  action: async (context, { request }) => {
    let token = '';
    if (request.authentication?.type === 'oauth2') {
      // Request Action からは OAuth2Token を読めないため、Authタブからコピーしたトークンを使う
      const clip = await context.app.clipboard.readText();
      token = looksLikeJwt(clip) ? clip : await context.app.prompt(
        'OAuth2のAccess Token / Identity Tokenを貼り付けてください（Authタブの欄からコピー）',
        { label: 'Token' },
      );
    } else {
      token = request.authentication?.token
        || request.headers?.find(h => h.name.toLowerCase() === 'authorization')?.value || '';
    }
    if (!token || token.includes('{{') || token.includes('{%')) {
      token = await context.app.prompt('JWTを貼り付けてください', { label: 'Token' });
    }
    const { header, payload } = decodeJwt(token);
    const expired = payload.exp && payload.exp * 1000 < Date.now();
    // スコープの表現はIdPごとに違う（scope: 文字列 / scp: 配列 / permissions, roles）
    const scopes = [payload.scope, payload.scp, payload.permissions, payload.roles]
      .flat().filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
    // プラグインのダイアログは改行を潰して表示するため、1行ずつ区切り文字で並べる
    await context.app.alert(
      expired ? 'JWT (期限切れ)' : `JWT (${payload.exp ? `残り ${fmtRemaining(payload.exp)}` : "exp なし"})`,
      [
        `alg: ${header.alg} / kid: ${header.kid ?? '-'}`,
        `sub: ${payload.sub ?? '-'}`,
        `iss: ${payload.iss ?? '-'}`,
        `aud: ${[payload.aud].flat().filter(Boolean).join(', ') || '-'}`,
        `scope: ${scopes.length ? scopes.join(', ') : '(なし)'}`,
        `exp: ${fmtTime(payload.exp)}`,
        'payload全体はクリップボードにコピーしました',
      ].join('　｜　'),
    );
    await context.app.clipboard.writeText(JSON.stringify(payload, null, 2));
  },
}];

// テンプレートタグ
module.exports.templateTags = [{
  name: 'jwt_claim',
  displayName: 'JWT Claim',
  description: 'JWTから指定したクレームを取り出す',
  args: [
    { displayName: 'Claim', type: 'string', defaultValue: 'sub' },
    { displayName: 'Token', type: 'string' },
  ],
  run: (context, claim, token) => {
    const v = decodeJwt(token).payload[claim];
    return typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
  },
}, {
  // OAuth2で取得したトークンを直接読んでデコードする（タグ編集画面の Live Preview がそのままデコーダーになる）
  name: 'oauth2_jwt',
  displayName: 'OAuth2 JWT',
  description: 'OAuth2で取得したAccess Token / Identity Tokenをデコードする',
  args: [
    {
      displayName: 'Token',
      type: 'enum',
      defaultValue: 'accessToken',
      options: [
        { displayName: 'Access Token', value: 'accessToken' },
        { displayName: 'Identity Token', value: 'identityToken' },
      ],
    },
    {
      displayName: 'Output',
      type: 'enum',
      defaultValue: 'payload',
      options: [
        { displayName: 'Payload (JSON)', value: 'payload' },
        { displayName: 'Header (JSON)', value: 'header' },
        { displayName: 'Claim', value: 'claim' },
        { displayName: 'Raw token', value: 'raw' },
      ],
    },
    {
      displayName: 'Claim',
      type: 'string',
      defaultValue: 'scope',
      hide: args => args[1].value !== 'claim',
    },
  ],
  run: async (context, field = 'accessToken', output = 'payload', claim = 'scope') => {
    const token = await findOAuth2Token(context, field);
    if (output === 'raw') {
      return token;
    }
    if (!looksLikeJwt(token)) {
      throw new Error(field === 'accessToken'
        ? 'Access TokenがJWTではありません（不透明トークン）。Identity Tokenを試してください'
        : 'このトークンはJWTではありません');
    }
    const { header, payload } = decodeJwt(token);
    if (output === 'header') {
      return JSON.stringify(header, null, 2);
    }
    if (output === 'claim') {
      const v = payload[claim];
      return typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
    }
    return JSON.stringify(payload, null, 2);
  },
}];
