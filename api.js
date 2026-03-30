/**
 * ═══════════════════════════════════════════════════════════════
 *  战线快报 · FRONTLINE DISPATCH
 *  api.js — Backend Interface Layer
 * ───────────────────────────────────────────────────────────────
 *
 *  All backend communication is routed through this file.
 *  To connect a real backend, set API_MODE to 'remote' and
 *  configure API_BASE_URL below. The rest of the app (app.js)
 *  never calls fetch() directly — it only calls API.* methods.
 *
 *  ┌─ SUPPORTED BACKENDS ──────────────────────────────────────┐
 *  │  'local'    localStorage only, no server needed (default) │
 *  │  'remote'   Your REST API (Cloudflare Workers, Node, etc) │
 *  └───────────────────────────────────────────────────────────┘
 *
 *  REST CONTRACT (for 'remote' mode):
 *
 *  Auth
 *    POST   /auth/signup          { username, email, password }
 *    POST   /auth/login           { email, password }
 *    POST   /auth/logout          (Bearer token)
 *
 *  Articles
 *    GET    /articles             ?tab=&search=&page=&limit=
 *    GET    /articles/:id
 *    POST   /articles             (admin) { title, source, url, category, desc, emoji, alertLevel, featured }
 *    DELETE /articles/:id         (admin)
 *
 *  Interactions
 *    POST   /articles/:id/like    toggle — returns { liked: bool, count: int }
 *    POST   /articles/:id/save    toggle — returns { saved: bool, count: int }
 *    GET    /articles/:id/comments
 *    POST   /articles/:id/comments { text }
 *
 *  Tabs / Categories
 *    GET    /tabs
 *    POST   /tabs                 (admin) { name }
 *    DELETE /tabs/:name           (admin)
 *
 *  User
 *    GET    /user/me              returns profile + saves list
 *    GET    /user/saved           returns saved article ids
 *
 *  Stats
 *    GET    /stats                { articles, today, users, comments }
 *
 *  All endpoints return JSON. Auth endpoints return { token, user }.
 *  Protected endpoints require header: Authorization: Bearer <token>
 * ═══════════════════════════════════════════════════════════════
 */

var API = (function () {

  /* ── CONFIG ─────────────────────────────────────────────────
   * Change API_MODE to 'remote' and set API_BASE_URL to enable
   * a real backend. JWT token is stored in localStorage.
   * ──────────────────────────────────────────────────────────── */
  var API_MODE     = 'remote';           // 'local' | 'remote'  ← change to 'remote' when deploying
  var API_BASE_URL = 'https://api.kalyna.homes'; // ← your Worker URL

  // Token key in localStorage
  var TOKEN_KEY = 'fl_token';

  /* ══════════════════════════════════════════════════════════
     LOCAL STORAGE HELPERS
     ══════════════════════════════════════════════════════════ */
  var LS = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; }
      catch (e) { return d; }
    },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
    del: function (k)    { localStorage.removeItem(k); }
  };

  /* Seed default data on first run */
  (function seed() {
    if (LS.get('fl_seeded', false)) return;
    LS.set('fl_tabs', ['全部', '东欧战场', '中东局势', '亚太动态', '非洲冲突', '军事分析', '人道危机', '外交博弈']);
    LS.set('fl_articles', [
      {
        id: 'fl_001',
        title: '乌克兰军队在哈尔科夫州发动反攻，夺回多个战略据点',
        source: 'Reuters',
        url: 'https://reuters.com',
        category: '东欧战场',
        desc: '据路透社获得的前线消息，乌克兰武装部队周二在哈尔科夫州北部地区发起大规模反攻，经过激烈交战后成功收复数个战略要地，俄军被迫向东北方向撤退。北约军事顾问对此次反攻的协调程度表示高度评价。',
        emoji: '🪖',
        alertLevel: 'BREAKING',
        featured: true,
        likes: 94,
        saves: 28,
        comments: [
          { user: '战地观察员', text: '这次反攻的时机选择很关键，正好在俄军补给线最脆弱的时候。', date: new Date(Date.now()-3600000).toISOString() }
        ],
        date: new Date(Date.now() - 1800000).toISOString()
      },
      {
        id: 'fl_002',
        title: '以色列与真主党停火协议再度告破，黎以边境炮击持续',
        source: 'Al Jazeera',
        url: 'https://aljazeera.com',
        category: '中东局势',
        desc: '联合国斡旋的停火协议在生效不到72小时后即宣告破裂，黎以边境地带再度陷入炮火交织的紧张态势，双方均指责对方率先违反协议。',
        emoji: '💥',
        alertLevel: 'URGENT',
        featured: false,
        likes: 67,
        saves: 19,
        comments: [],
        date: new Date(Date.now() - 7200000).toISOString()
      },
      {
        id: 'fl_003',
        title: '苏丹内战：达尔富尔地区人道主义危机持续恶化，联合国警告饥荒',
        source: 'BBC',
        url: 'https://bbc.com',
        category: '非洲冲突',
        desc: '联合国人道主义事务协调厅发出严峻警告，称苏丹达尔富尔地区正面临近二十年来最严重的人道主义灾难，逾三百万平民流离失所，粮食供应濒临断绝。',
        emoji: '🆘',
        alertLevel: 'ANALYSIS',
        featured: false,
        likes: 42,
        saves: 31,
        comments: [
          { user: '人道关怀', text: '国际社会必须立即采取行动，不能让达尔富尔的悲剧重演。', date: new Date(Date.now()-86400000).toISOString() }
        ],
        date: new Date(Date.now() - 14400000).toISOString()
      },
      {
        id: 'fl_004',
        title: '台海军事动态：解放军东部战区例行演习，美第七舰队回应过境',
        source: '路透社',
        url: 'https://reuters.com',
        category: '亚太动态',
        desc: '解放军东部战区宣布在台湾海峡附近举行为期三天的联合军事演习，与此同时美国海军第七舰队一艘驱逐舰在例行的"自由航行"任务中穿越台海，局势引发地区各方高度关注。',
        emoji: '⚓',
        alertLevel: '',
        featured: false,
        likes: 58,
        saves: 22,
        comments: [],
        date: new Date(Date.now() - 21600000).toISOString()
      },
      {
        id: 'fl_005',
        title: '北约峰会公报：增加对乌军援承诺，讨论远程武器授权问题',
        source: 'Financial Times',
        url: 'https://ft.com',
        category: '外交博弈',
        desc: '在布鲁塞尔召开的北约外长级峰会上，32个成员国就进一步增加对乌克兰的军事援助达成共识，并首次公开讨论授权乌方使用西方提供的远程武器打击俄境内目标的可能性。',
        emoji: '🗺',
        alertLevel: 'EXCLUSIVE',
        featured: false,
        likes: 36,
        saves: 14,
        comments: [],
        date: new Date(Date.now() - 36000000).toISOString()
      }
    ]);
    LS.set('fl_users', []);
    LS.set('fl_seeded', true);
  })();

  /* ══════════════════════════════════════════════════════════
     REMOTE HTTP HELPER
     ══════════════════════════════════════════════════════════ */
  function http(method, path, body) {
    var token = LS.get('fl_token', null);
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE_URL + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.json().then(function(e){ throw new Error(e.error || e.message || 'Request failed'); });
      return r.json();
    });
  }

  /* ══════════════════════════════════════════════════════════
     LOCAL IMPLEMENTATIONS
     ══════════════════════════════════════════════════════════ */
  var Local = {

    /* Auth */
    signup: function (username, email, password) {
      var users = LS.get('fl_users', []);
      if (users.some(function(u){ return u.email === email; })) {
        return Promise.reject({ code: 'EMAIL_EXISTS' });
      }
      var isFirst = users.length === 0;
      var user = { id: 'u_' + Date.now(), username: username, email: email,
                   password: password, isAdmin: isFirst, joinDate: new Date().toISOString() };
      users.push(user);
      LS.set('fl_users', users);
      var safe = _strip(user);
      LS.set('fl_session', safe);
      return Promise.resolve({ user: safe });
    },

    login: function (email, password) {
      var users = LS.get('fl_users', []);
      var user = users.find(function(u){ return u.email === email && u.password === password; });
      if (!user) return Promise.reject({ code: 'BAD_CREDENTIALS' });
      var safe = _strip(user);
      LS.set('fl_session', safe);
      return Promise.resolve({ user: safe });
    },

    logout: function () {
      LS.del('fl_session');
      return Promise.resolve();
    },

    getSession: function () {
      return Promise.resolve(LS.get('fl_session', null));
    },

    /* Articles */
    getArticles: function (opts) {
      var arts = LS.get('fl_articles', []);
      opts = opts || {};
      if (opts.tab && opts.tab !== '全部') {
        arts = arts.filter(function(a){ return a.category === opts.tab; });
      }
      if (opts.search) {
        var q = opts.search.toLowerCase();
        arts = arts.filter(function(a){
          return (a.title||'').toLowerCase().indexOf(q) >= 0 ||
                 (a.desc||'').toLowerCase().indexOf(q) >= 0 ||
                 (a.source||'').toLowerCase().indexOf(q) >= 0;
        });
      }
      return Promise.resolve(arts);
    },

    getArticle: function (id) {
      var arts = LS.get('fl_articles', []);
      var a = arts.find(function(x){ return x.id === id; });
      return a ? Promise.resolve(a) : Promise.reject({ code: 'NOT_FOUND' });
    },

    publishArticle: function (data) {
      var arts = LS.get('fl_articles', []);
      var art = Object.assign({
        id: 'fl_' + Date.now(),
        likes: 0, saves: 0, comments: [],
        date: new Date().toISOString()
      }, data);
      arts.unshift(art);
      LS.set('fl_articles', arts);
      return Promise.resolve(art);
    },

    deleteArticle: function (id) {
      var arts = LS.get('fl_articles', []).filter(function(a){ return a.id !== id; });
      LS.set('fl_articles', arts);
      return Promise.resolve();
    },

    /* Interactions */
    toggleLike: function (articleId, userId) {
      var arts = LS.get('fl_articles', []);
      var a = arts.find(function(x){ return x.id === articleId; });
      if (!a) return Promise.reject({ code: 'NOT_FOUND' });
      var key = 'fl_likes_' + userId;
      var likes = LS.get(key, []);
      var idx = likes.indexOf(articleId);
      var liked;
      if (idx >= 0) { likes.splice(idx, 1); a.likes = Math.max(0, a.likes - 1); liked = false; }
      else           { likes.push(articleId); a.likes++; liked = true; }
      LS.set(key, likes);
      LS.set('fl_articles', arts);
      return Promise.resolve({ liked: liked, count: a.likes });
    },

    toggleSave: function (articleId, userId) {
      var arts = LS.get('fl_articles', []);
      var a = arts.find(function(x){ return x.id === articleId; });
      if (!a) return Promise.reject({ code: 'NOT_FOUND' });
      var key = 'fl_saves_' + userId;
      var saves = LS.get(key, []);
      var idx = saves.indexOf(articleId);
      var saved;
      if (idx >= 0) { saves.splice(idx, 1); a.saves = Math.max(0, (a.saves||1) - 1); saved = false; }
      else           { saves.push(articleId); a.saves = (a.saves||0) + 1; saved = true; }
      LS.set(key, saves);
      LS.set('fl_articles', arts);
      return Promise.resolve({ saved: saved, count: a.saves });
    },

    getUserLikes: function (userId) {
      return Promise.resolve(LS.get('fl_likes_' + userId, []));
    },

    getUserSaves: function (userId) {
      return Promise.resolve(LS.get('fl_saves_' + userId, []));
    },

    postComment: function (articleId, userId, username, text) {
      var arts = LS.get('fl_articles', []);
      var a = arts.find(function(x){ return x.id === articleId; });
      if (!a) return Promise.reject({ code: 'NOT_FOUND' });
      var comment = { id: 'c_' + Date.now(), user: username, userId: userId,
                      text: text, date: new Date().toISOString() };
      a.comments = a.comments || [];
      a.comments.unshift(comment);
      LS.set('fl_articles', arts);
      return Promise.resolve(comment);
    },

    /* Tabs */
    getTabs: function () {
      return Promise.resolve(LS.get('fl_tabs', ['全部']));
    },

    addTab: function (name) {
      var tabs = LS.get('fl_tabs', ['全部']);
      if (tabs.indexOf(name) >= 0) return Promise.reject({ code: 'TAB_EXISTS' });
      tabs.push(name);
      LS.set('fl_tabs', tabs);
      return Promise.resolve(tabs);
    },

    deleteTab: function (name) {
      if (name === '全部') return Promise.reject({ code: 'FORBIDDEN' });
      var tabs = LS.get('fl_tabs', []).filter(function(t){ return t !== name; });
      LS.set('fl_tabs', tabs);
      return Promise.resolve(tabs);
    },

    /* Stats */
    getStats: function () {
      var arts = LS.get('fl_articles', []);
      var users = LS.get('fl_users', []);
      var today = new Date().toDateString();
      var todayCount = arts.filter(function(a){
        return new Date(a.date).toDateString() === today;
      }).length;
      var totalComments = arts.reduce(function(s, a){ return s + (a.comments||[]).length; }, 0);
      return Promise.resolve({
        articles: arts.length,
        today:    todayCount,
        users:    users.length,
        comments: totalComments
      });
    },

    /* View tracking (local only) */
    recordView: function (articleId) {
      var views = LS.get('fl_views', []);
      if (views.indexOf(articleId) < 0) {
        views.unshift(articleId);
        LS.set('fl_views', views.slice(0, 60));
      }
      return Promise.resolve();
    },

    getViewHistory: function () {
      return Promise.resolve(LS.get('fl_views', []));
    }
  };

  /* ══════════════════════════════════════════════════════════
     REMOTE IMPLEMENTATIONS  (maps to REST contract above)
     ══════════════════════════════════════════════════════════ */
  var Remote = {

    signup: function (username, email, password) {
      return http('POST', '/auth/signup', { username, email, password })
        .then(function(r){ LS.set('fl_token', r.token); LS.set('fl_session', r.user); return r; });
    },

    login: function (email, password) {
      return http('POST', '/auth/login', { email, password })
        .then(function(r){
          LS.set('fl_token', r.token); LS.set('fl_session', r.user);
          // Request push permission after login
          setTimeout(function () {
            if (window.FL_requestPush) window.FL_requestPush();
          }, 1500);
          return r;
        });
    },

    logout: function () {
      return http('POST', '/auth/logout').finally(function(){
        LS.del('fl_token'); LS.del('fl_session');
      });
    },

    getSession: function () {
      var session = LS.get('fl_session', null);
      if (!session) return Promise.resolve(null);
      // Optionally verify token freshness: return http('GET', '/user/me');
      return Promise.resolve(session);
    },

    getArticles: function (opts) {
      var params = [];
      if (opts && opts.tab && opts.tab !== '全部') params.push('tab=' + encodeURIComponent(opts.tab));
      if (opts && opts.search) params.push('search=' + encodeURIComponent(opts.search));
      if (opts && opts.feed)   params.push('feed=' + encodeURIComponent(opts.feed));
      return http('GET', '/articles' + (params.length ? '?' + params.join('&') : ''));
    },
    getArticle:     function (id)   { return http('GET', '/articles/' + id); },
    publishArticle: function (data) { return http('POST', '/articles', data); },
    deleteArticle:  function (id)   { return http('DELETE', '/articles/' + id); },
    toggleLike:     function (aid)  { return http('POST', '/articles/' + aid + '/like'); },
    toggleSave:     function (aid)  { return http('POST', '/articles/' + aid + '/save'); },
    getUserLikes:   function ()     { return http('GET', '/user/me').then(function(u){ return u.likes||[]; }); },
    getUserSaves:   function ()     { return http('GET', '/user/saved').then(function(r){ return r.ids||[]; }); },
    postComment: function (articleId, _uid, _uname, text, parentId) {
      return http('POST', '/articles/' + articleId + '/comments', { text: text, parentId: parentId||null });
    },
    toggleCommentLike: function (articleId, commentId) {
      return http('POST', '/articles/' + articleId + '/comments/' + commentId + '/like');
    },
    deleteComment: function (articleId, commentId) {
      return http('DELETE', '/articles/' + articleId + '/comments/' + commentId);
    },
    getTabs:   function ()     { return http('GET', '/tabs'); },
    addTab:    function (name) { return http('POST', '/tabs', { name: name }); },
    deleteTab: function (name) { return http('DELETE', '/tabs/' + encodeURIComponent(name)); },
    getStats:  function ()     { return http('GET', '/stats'); },
    recordView:     function (id) { return http('POST', '/articles/'+id+'/view').catch(function(){}); },
    getViewHistory: function ()   { return http('GET', '/user/views').catch(function(){ return []; }); },

    /* Social */
    getProfile:        function (uid)  { return http('GET', '/profile/' + uid); },
    getProfileArticles:function (uid)  { return http('GET', '/profile/' + uid + '/articles'); },
    getProfileComments:function (uid)  { return http('GET', '/profile/' + uid + '/comments'); },
    toggleFollow:      function (uid)  { return http('POST', '/follows/' + uid); },
    getFollowStats:    function (uid)  { return http('GET', '/follows/' + uid + '/stats'); },

    /* Notifications */
    getNotifications:    function ()   { return http('GET', '/notifications'); },
    getUnreadCount:      function ()   { return http('GET', '/notifications/unread-count'); },
    markAllRead:         function ()   { return http('POST', '/notifications/read-all'); },
    markRead:            function (id) { return http('POST', '/notifications/' + id + '/read'); },
  };

  /* ── Utility: strip password from user object ── */
  function _strip(u) {
    return { id: u.id, username: u.username, email: u.email, isAdmin: u.isAdmin, joinDate: u.joinDate };
  }

  /* ── Route to the active backend ── */
  var backend = API_MODE === 'remote' ? Remote : Local;

  /* ══════════════════════════════════════════════════════════
     PUBLIC API  — the only surface app.js ever touches
     ══════════════════════════════════════════════════════════ */
  return {
    mode: function () { return API_MODE; },

    /* Auth */
    signup:     function (u, e, p) { return backend.signup(u, e, p); },
    login:      function (e, p)    { return backend.login(e, p); },
    logout:     function ()        { return backend.logout(); },
    getSession: function ()        { return backend.getSession(); },

    /* Articles */
    getArticles:    function (opts) { return backend.getArticles(opts); },
    getArticle:     function (id)   { return backend.getArticle(id); },
    publishArticle: function (data) { return backend.publishArticle(data); },
    deleteArticle:  function (id)   { return backend.deleteArticle(id); },

    /* Interactions */
    toggleLike:        function (aid, uid)               { return backend.toggleLike(aid, uid); },
    toggleSave:        function (aid, uid)               { return backend.toggleSave(aid, uid); },
    getUserLikes:      function (uid)                    { return backend.getUserLikes(uid); },
    getUserSaves:      function (uid)                    { return backend.getUserSaves(uid); },
    postComment:       function (aid, uid, uname, text, parentId) { return backend.postComment(aid, uid, uname, text, parentId); },
    toggleCommentLike: function (aid, cid)               { return backend.toggleCommentLike(aid, cid); },
    deleteComment:     function (aid, cid)               { return backend.deleteComment(aid, cid); },

    /* Tabs */
    getTabs:   function ()     { return backend.getTabs(); },
    addTab:    function (name) { return backend.addTab(name); },
    deleteTab: function (name) { return backend.deleteTab(name); },

    /* Stats */
    getStats: function () { return backend.getStats(); },

    /* Views */
    recordView:     function (id) { return backend.recordView(id); },
    getViewHistory: function ()   { return backend.getViewHistory(); },

    /* Social */
    getProfile:         function (uid) { return backend.getProfile(uid); },
    getProfileArticles: function (uid) { return backend.getProfileArticles(uid); },
    getProfileComments: function (uid) { return backend.getProfileComments(uid); },
    toggleFollow:       function (uid) { return backend.toggleFollow(uid); },
    getFollowStats:     function (uid) { return backend.getFollowStats(uid); },

    /* Notifications */
    getNotifications: function ()   { return backend.getNotifications(); },
    getUnreadCount:   function ()   { return backend.getUnreadCount(); },
    markAllRead:      function ()   { return backend.markAllRead(); },
    markRead:         function (id) { return backend.markRead(id); },
  };

})();
