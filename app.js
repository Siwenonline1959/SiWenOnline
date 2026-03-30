/**
 * 战线快报 · FRONTLINE DISPATCH
 * app.js v2 — Social features: profiles, follows, comment threads, notifications
 */

/* ══════════════════════════════════════════════════════════
   IMAGE UPLOAD
   ══════════════════════════════════════════════════════════ */
var ImageUpload = {
  _stores: {},

  _store: function (prefix) {
    if (!this._stores[prefix]) this._stores[prefix] = { files: [], blobUrls: [] };
    return this._stores[prefix];
  },

  init: function (prefix) {
    var self = this;
    var store = self._store(prefix);
    var area  = document.getElementById(prefix + '-img-area');
    var input = document.getElementById(prefix + '-img-input');
    if (!area || !input || area._imgInited) return;
    area._imgInited = true;

    area.addEventListener('click', function (e) {
      if (e.target.closest('.img-del') || e.target.closest('.img-preview-item')) return;
      input.click();
    });
    input.addEventListener('change', function () {
      self._addFiles(prefix, Array.from(input.files));
      input.value = '';
    });
    area.addEventListener('dragover', function (e) { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', function () { area.classList.remove('drag-over'); });
    area.addEventListener('drop', function (e) {
      e.preventDefault(); area.classList.remove('drag-over');
      self._addFiles(prefix, Array.from(e.dataTransfer.files).filter(function(f){ return f.type.startsWith('image/'); }));
    });
    document.addEventListener('paste', function (e) {
      var dlg = area.closest('[id^="dlg-"]');
      if (!dlg || !dlg.classList.contains('is-open')) return;
      var files = Array.from(e.clipboardData.items || [])
        .filter(function(i){ return i.type.startsWith('image/'); })
        .map(function(i){ return i.getAsFile(); }).filter(Boolean);
      if (files.length) self._addFiles(prefix, files);
    });
  },

  _addFiles: function (prefix, files) {
    var store = this._store(prefix);
    var room = 9 - store.files.length;
    if (!room) { Toast.show('最多上传9张图片', true); return; }
    files.slice(0, room).forEach(function (f) {
      store.files.push(f);
      store.blobUrls.push(URL.createObjectURL(f));
    });
    this._render(prefix);
  },

  _render: function (prefix) {
    var store = this._store(prefix);
    var grid  = document.getElementById(prefix + '-img-preview');
    var ph    = document.getElementById(prefix + '-img-placeholder');
    if (!grid) return;
    if (ph) ph.style.display = store.files.length ? 'none' : '';
    grid.innerHTML = store.blobUrls.map(function (url, i) {
      return '<div class="img-preview-item">' +
        '<img src="' + url + '" alt="">' +
        '<button class="img-del" type="button" data-prefix="' + prefix + '" data-idx="' + i + '">✕</button>' +
        '</div>';
    }).join('');
    grid.querySelectorAll('.img-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        ImageUpload.remove(btn.dataset.prefix, parseInt(btn.dataset.idx));
      });
    });
  },

  remove: function (prefix, idx) {
    var store = this._store(prefix);
    URL.revokeObjectURL(store.blobUrls[idx]);
    store.files.splice(idx, 1);
    store.blobUrls.splice(idx, 1);
    this._render(prefix);
  },

  uploadAll: function (prefix) {
    var store = this._store(prefix);
    if (!store.files.length) return Promise.resolve([]);
    var token = (function () {
      try { var r = localStorage.getItem('fl_token'); if (!r) return '';
        try { var p = JSON.parse(r); return typeof p === 'string' ? p : r; } catch (e) { return r; }
      } catch (e) { return ''; }
    })();
    var apiBase = (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'https://api.kalyna.homes');
    return Promise.all(store.files.map(function (f) {
      var fd = new FormData(); fd.append('file', f);
      return fetch(apiBase + '/media/upload', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd
      }).then(function (r) {
        if (!r.ok) return r.json().then(function(e){ throw new Error(e.error || '上传失败'); });
        return r.json();
      }).then(function (d) { return d.url; });
    }));
  },

  reset: function (prefix) {
    var store = this._stores[prefix];
    if (store) store.blobUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    var area = document.getElementById(prefix + '-img-area');
    if (area) area._imgInited = false;
    this._stores[prefix] = { files: [], blobUrls: [] };
    this._render(prefix);
    var ph = document.getElementById(prefix + '-img-placeholder');
    if (ph) ph.style.display = '';
  },

  getCount: function (prefix) {
    return (this._stores[prefix] && this._stores[prefix].files.length) || 0;
  }
};

/* ══════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════ */
var State = {
  currentTab:   '全部',
  currentFeed:  'all',      // 'all' | 'following'
  searchQuery:  '',
  currentUser:  null,
  userLikes:    [],
  userSaves:    [],
  unreadCount:  0,
};

/* ══════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  Clock.start();
  Dialog.initAll();

  API.getSession().then(function (user) {
    State.currentUser = user;
    if (user) {
      return Promise.all([
        API.getUserLikes(user.id),
        API.getUserSaves(user.id)
      ]).then(function (r) {
        State.userLikes = r[0] || [];
        State.userSaves = r[1] || [];
      });
    }
  }).then(function () {
    Auth.renderHeader();
    return App.refresh();
  }).catch(function (e) {
    console.error('[boot]', e);
    Auth.renderHeader();
    App.refresh();
  });
});

/* ══════════════════════════════════════════════════════════
   CLOCK
   ══════════════════════════════════════════════════════════ */
var Clock = {
  start: function () {
    function tick() {
      var el = document.getElementById('utc-clock');
      if (!el) return;
      var now = new Date();
      var pad = function(n){ return n<10?'0'+n:n; };
      el.textContent = 'UTC '+pad(now.getUTCHours())+':'+pad(now.getUTCMinutes())+':'+pad(now.getUTCSeconds());
    }
    tick(); setInterval(tick, 1000);
  }
};

/* ══════════════════════════════════════════════════════════
   TICKER
   ══════════════════════════════════════════════════════════ */
var Ticker = {
  init: function () {
    API.getArticles({}).then(function (arts) {
      var texts = (arts||[]).slice(0,8).map(function(a){
        return (a.alertLevel?'【'+a.alertLevel+'】':'★')+' '+a.title;
      });
      var el = document.getElementById('ticker-content');
      if (el) el.textContent = texts.join('　　·　　');
    }).catch(function(){});
  }
};

/* ══════════════════════════════════════════════════════════
   APP CORE
   ══════════════════════════════════════════════════════════ */
var App = {
  refresh: function () {
    Ticker.init();
    return Promise.all([
      App.renderTabs(),
      App.renderFeed(),
      App.renderSidebar(),
      App.renderStats(),
    ]);
  },

  /* ── TABS ── */
  renderTabs: function () {
    return Promise.all([API.getTabs(), API.getArticles({})]).then(function (res) {
      var tabs = res[0] || [];
      var allArts = res[1] || [];
      var nav = document.getElementById('tabs-row');
      nav.innerHTML = '';

      // "关注" pseudo-tab (only shown when logged in)
      if (State.currentUser) {
        var followBtn = document.createElement('button');
        followBtn.className = 'tab-btn' + (State.currentFeed==='following' ? ' active' : '');
        followBtn.innerHTML = '关注';
        followBtn.addEventListener('click', function(){ App.switchFeed('following'); });
        nav.appendChild(followBtn);
      }

      tabs.forEach(function (t) {
        var count = t==='全部' ? allArts.length : allArts.filter(function(a){return a.category===t;}).length;
        var btn = document.createElement('button');
        btn.className = 'tab-btn' + (State.currentFeed==='all' && State.currentTab===t ? ' active' : '');
        btn.innerHTML = t + (count>0 ? '<span class="tab-pip">'+count+'</span>' : '');
        btn.addEventListener('click', function(){ App.switchTab(t); });
        nav.appendChild(btn);
      });
    });
  },

  switchTab: function (tab) {
    State.currentTab  = tab;
    State.currentFeed = 'all';
    State.searchQuery = '';
    var si = document.getElementById('search-input');
    if (si) si.value = '';
    App.renderTabs();
    App.renderFeed();
  },

  switchFeed: function (feed) {
    if (feed === 'following' && !State.currentUser) {
      Toast.show('请先登录', true); Dialog.open('dlg-login'); return;
    }
    State.currentFeed = feed;
    State.searchQuery = '';
    App.renderTabs();
    App.renderFeed();
  },

  /* ── FEED ── */
  renderFeed: function () {
    var feedEl = document.getElementById('news-feed');
    feedEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-text">LOADING…</div></div>';

    var opts = {
      tab:    State.currentTab,
      search: State.searchQuery,
      feed:   State.currentFeed === 'following' ? 'following' : undefined,
    };

    return API.getArticles(opts).then(function (arts) {
      arts = arts || [];
      var alertOrder = {BREAKING:0,URGENT:1,EXCLUSIVE:2,ANALYSIS:3,'':4};
      if (State.currentFeed !== 'following') {
        arts = arts.slice().sort(function(a,b){
          if (a.featured && !b.featured) return -1;
          if (!a.featured && b.featured) return 1;
          var ao = alertOrder[a.alertLevel||'']!==undefined?alertOrder[a.alertLevel||'']:4;
          var bo = alertOrder[b.alertLevel||'']!==undefined?alertOrder[b.alertLevel||'']:4;
          if (ao !== bo) return ao - bo;
          // Same alert level — sort by date descending (newest first)
          var ad = a.date || ''; var bd = b.date || '';
          return bd > ad ? 1 : bd < ad ? -1 : 0;
        });
      }

      var feedLabel = document.getElementById('feed-label');
      var feedCount = document.getElementById('feed-count');
      if (feedLabel) feedLabel.textContent = State.currentFeed==='following' ? '// 关注动态' : '// '+State.currentTab;
      if (feedCount) feedCount.textContent = arts.length + ' 条战报' + (State.searchQuery?' · 搜索："'+State.searchQuery+'"':'');

      if (arts.length === 0) {
        var msg = State.currentFeed==='following' ? '关注的人还没有发布内容' : '暂无相关战报';
        feedEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📡</div><div class="empty-text">// NO SIGNAL — '+msg+'</div></div>';
        return;
      }
      feedEl.innerHTML = arts.map(function(a,i){ return Render.card(a,i); }).join('');
    }).catch(function(e){
      console.error('[feed]',e);
      feedEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠</div><div class="empty-text">// LOAD ERROR</div></div>';
    });
  },

  /* ── SIDEBAR ── */
  renderSidebar: function () {
    return API.getArticles({}).then(function (arts) {
      arts = arts || [];
      var sorted = arts.slice().sort(function(a,b){return b.likes-a.likes;}).slice(0,5);
      var hotEl = document.getElementById('hot-feed');
      if (hotEl) {
        hotEl.innerHTML = sorted.map(function(a,i){
          var cls = i===0?' r1':i===1?' r2':i===2?' r3':'';
          return '<div class="hot-item" data-id="'+a.id+'">'+
            '<div class="hot-rank'+cls+'">'+(i+1)+'</div>'+
            '<div><div class="hot-text">'+esc(a.title)+'</div>'+
            '<div class="hot-meta">♥ '+a.likes+' · '+esc(a.source)+'</div></div></div>';
        }).join('');
        hotEl.querySelectorAll('.hot-item').forEach(function(el){
          el.addEventListener('click', function(){ Article.open(el.dataset.id); });
        });
      }
      return API.getTabs().then(function(tabs){
        var catsEl = document.getElementById('cats-body');
        if (!catsEl) return;
        catsEl.innerHTML = (tabs||[]).filter(function(t){return t!=='全部';}).map(function(t){
          var count = arts.filter(function(a){return a.category===t;}).length;
          return '<div class="cat-item" data-tab="'+t+'"><span class="cat-name">▸ '+t+'</span><span class="cat-count">'+count+'</span></div>';
        }).join('');
        catsEl.querySelectorAll('.cat-item').forEach(function(el){
          el.addEventListener('click', function(){ App.switchTab(el.dataset.tab); });
        });
      });
    });
  },

  renderStats: function () {
    return API.getStats().then(function(s){
      if (!s) return;
      document.getElementById('s-articles').textContent = s.articles||0;
      document.getElementById('s-today').textContent    = s.today||0;
      document.getElementById('s-users').textContent    = s.users||0;
      document.getElementById('s-comments').textContent = s.comments||0;
    }).catch(function(){});
  },

  renderSaved: function () {
    var widget = document.getElementById('widget-saved');
    var feedEl = document.getElementById('saved-feed');
    if (!State.currentUser || !widget) return;
    API.getUserSaves(State.currentUser.id).then(function(ids){
      State.userSaves = ids||[];
      if (!ids||ids.length===0){ widget.hidden=true; return; }
      return API.getArticles({}).then(function(arts){
        var saved = ids.map(function(id){ return (arts||[]).find(function(a){return a.id===id;}); }).filter(Boolean);
        if (!saved.length){ widget.hidden=true; return; }
        widget.hidden = false;
        feedEl.innerHTML = saved.map(function(a){
          return '<div class="saved-item" data-id="'+a.id+'">'+
            '<span class="saved-emoji">'+(a.emoji||'📰')+'</span>'+
            '<div><div class="saved-title">'+esc(a.title)+'</div>'+
            '<div class="saved-src">'+esc(a.source)+'</div></div></div>';
        }).join('');
        feedEl.querySelectorAll('.saved-item').forEach(function(el){
          el.addEventListener('click', function(){ Article.open(el.dataset.id); });
        });
      });
    }).catch(function(){ if(widget) widget.hidden=true; });
  },

  openSaved: function () {
    Dialog.close('dlg-user');
    App.renderSaved();
    Toast.show('已展开存档面板');
  }
};

/* ══════════════════════════════════════════════════════════
   CARD RENDERER
   ══════════════════════════════════════════════════════════ */
var Render = {
  card: function (a, i) {
    var liked   = State.userLikes.indexOf(a.id) >= 0;
    var saved   = State.userSaves.indexOf(a.id) >= 0;
    var isFeat  = a.featured && i===0 && State.currentFeed==='all' && State.currentTab==='全部' && !State.searchQuery;

    var tags = '<span class="tag tag-cat">'+a.category+'</span>';
    if (a.alertLevel) tags += '<span class="tag tag-alert-'+a.alertLevel+'">'+a.alertLevel+'</span>';
    if (isFeat)       tags += '<span class="tag tag-featured">★ FEATURED</span>';
    tags += '<span class="tag-source">'+esc(a.source)+'</span>';
    tags += '<span class="tag-date">'+formatDate(a.date)+'</span>';

    var authorHtml = a.authorId
      ? '<span class="card-author" data-uid="'+a.authorId+'">@'+esc(a.authorName||'匿名')+'</span>'
      : '';

    return '<div class="news-card'+(isFeat?' is-featured':'')+'" data-id="'+a.id+'">'+
      '<div class="card-inner">'+
      '<div class="card-icon">'+(a.emoji||'📰')+'</div>'+
      '<div class="card-body">'+
      '<div class="card-tags">'+tags+authorHtml+'</div>'+
      '<div class="card-title">'+esc(a.title)+'</div>'+
      (a.desc?'<div class="card-desc">'+esc(a.desc)+'</div>':'')+
      (a.images&&a.images.length?(function(){var imgs=a.images;return '<div class="art-img-grid art-img-grid--'+Math.min(imgs.length,3)+'" data-imgs="'+esc(JSON.stringify(imgs))+'">'+imgs.map(function(u,i){return '<img src="'+esc(u)+'" alt="" loading="lazy" data-idx="'+i+'" class="art-img-thumb">';}).join('')+'</div>';})():'')+
      '<div class="card-actions">'+
      '<button class="act-btn'+(liked?' is-liked':'')+'" data-action="like" data-id="'+a.id+'">♥ <span>'+a.likes+'</span></button>'+
      '<button class="act-btn'+(saved?' is-saved':'')+'" data-action="save" data-id="'+a.id+'">◈ <span>'+(a.saves||0)+'</span></button>'+
      '<button class="act-btn" data-action="comment" data-id="'+a.id+'">💬 '+(a.commentsCount||0)+'</button>'+
      '<button class="act-btn act-btn-read" data-action="open" data-id="'+a.id+'">阅读 →</button>'+
      '</div></div></div></div>';
  }
};

/* Delegate card clicks */
document.addEventListener('click', function (e) {
  // Author name → profile
  var authorEl = e.target.closest('.card-author');
  if (authorEl) { e.stopPropagation(); Profile.open(authorEl.dataset.uid); return; }

  var btn = e.target.closest('[data-action]');
  if (btn) {
    e.stopPropagation();
    var action = btn.dataset.action, id = btn.dataset.id;
    if (action==='like')    Interactions.like(id, btn);
    if (action==='save')    Interactions.save(id, btn);
    if (action==='comment') Article.open(id, true);
    if (action==='open')    Article.open(id);
    return;
  }

  // Click anywhere on card → open article
  var card = e.target.closest('.news-card');
  if (card && card.dataset.id) Article.open(card.dataset.id);
});

/* ══════════════════════════════════════════════════════════
   INTERACTIONS
   ══════════════════════════════════════════════════════════ */
var Interactions = {
  like: function (id, btn) {
    if (!State.currentUser) { Toast.show('请先登录', true); Dialog.open('dlg-login'); return; }
    API.toggleLike(id, State.currentUser.id).then(function(r){
      var idx = State.userLikes.indexOf(id);
      if (r.liked){ if(idx<0) State.userLikes.push(id); }
      else        { if(idx>=0) State.userLikes.splice(idx,1); }
      document.querySelectorAll('[data-action="like"][data-id="'+id+'"]').forEach(function(b){
        b.className='act-btn'+(r.liked?' is-liked':'');
        var s=b.querySelector('span'); if(s) s.textContent=r.count;
      });
      var mb=document.getElementById('modal-like-'+id);
      if(mb){ mb.className='act-btn'+(r.liked?' is-liked':''); var s=mb.querySelector('span'); if(s)s.textContent=r.count; }
      Toast.show(r.liked?'已点赞 ♥':'已取消点赞');
    }).catch(function(){ Toast.show('操作失败',true); });
  },

  save: function (id, btn) {
    if (!State.currentUser) { Toast.show('请先登录', true); Dialog.open('dlg-login'); return; }
    API.toggleSave(id, State.currentUser.id).then(function(r){
      var idx = State.userSaves.indexOf(id);
      if (r.saved){ if(idx<0) State.userSaves.push(id); }
      else        { if(idx>=0) State.userSaves.splice(idx,1); }
      // Update card buttons in feed
      document.querySelectorAll('[data-action="save"][data-id="'+id+'"]').forEach(function(b){
        b.className='act-btn'+(r.saved?' is-saved':'');
        var s=b.querySelector('span'); if(s) s.textContent=r.count;
      });
      // Update modal save button
      var mb = document.getElementById('modal-save-'+id);
      if (mb) { mb.className='act-btn'+(r.saved?' is-saved':''); var s=mb.querySelector('span'); if(s)s.textContent=r.count; }
      App.renderSaved();
      Toast.show(r.saved?'已收藏 ◈':'已取消收藏');
    }).catch(function(){ Toast.show('操作失败',true); });
  },

  likeComment: function (articleId, commentId, btn) {
    if (!State.currentUser) { Toast.show('请先登录', true); Dialog.open('dlg-login'); return; }
    API.toggleCommentLike(articleId, commentId).then(function(r){
      if (btn) {
        btn.className = 'cmt-like-btn'+(r.liked?' is-liked':'');
        var s = btn.querySelector('.cmt-like-count'); if(s) s.textContent=r.count;
      }
    }).catch(function(){ Toast.show('操作失败',true); });
  }
};

/* ══════════════════════════════════════════════════════════
   ARTICLE DETAIL
   ══════════════════════════════════════════════════════════ */
var Article = {
  _currentArticleId: null,

  open: function (id, focusComment) {
    API.getArticle(id).then(function(a){
      Article._currentArticleId = id;
      API.recordView(id);
      Article._render(a);
      Dialog.open('dlg-article');
      if (focusComment) {
        setTimeout(function(){
          var ta=document.getElementById('comment-ta'); if(ta) ta.focus();
        }, 200);
      }
    }).catch(function(){ Toast.show('加载失败',true); });
  },

  _render: function (a) {
    var liked = State.userLikes.indexOf(a.id)>=0;
    var saved = State.userSaves.indexOf(a.id)>=0;

    document.getElementById('art-dlg-label').textContent = '// '+a.source+' · '+a.category;

    var tags = '';
    if (a.alertLevel) tags += '<span class="tag tag-alert-'+a.alertLevel+'">'+a.alertLevel+'</span>';
    if (a.featured)   tags += '<span class="tag tag-featured">★ FEATURED</span>';

    var authorHtml = a.authorId
      ? '<span class="art-author-link" data-uid="'+a.authorId+'" onclick="Dialog.close(\'dlg-article\');setTimeout(function(){Profile.open(\''+a.authorId+'\');},120)">@'+esc(a.authorName||'匿名')+'</span>'
      : '';

    var commentsHtml = Article._renderCommentTree(a.comments||[], a.id);

    var commentArea = State.currentUser
      ? '<div class="comment-input-wrap">'+
        '<textarea id="comment-ta" placeholder="发表评论… (Ctrl+Enter发送)" onkeydown="Article.commentKey(event,\''+a.id+'\')"></textarea>'+
        '<button class="btn-comment" onclick="Article.postComment(\''+a.id+'\',null)">发送 ▶</button>'+
        '</div>'
      : '<div class="login-prompt"><a href="#" onclick="Dialog.close(\'dlg-article\');Dialog.open(\'dlg-login\')">登录</a> 后参与讨论</div>';

    document.getElementById('art-dlg-body').innerHTML =
      '<div class="art-source-row">'+
      '<span class="art-source-name">'+esc(a.source)+'</span>'+tags+authorHtml+
      '<span class="tag-date">'+formatDate(a.date)+'</span>'+
      '</div>'+
      '<div class="art-title">'+esc(a.title)+'</div>'+
      (a.desc?'<div class="art-desc">'+esc(a.desc)+'</div>':'')+
      (a.images&&a.images.length?(function(){var imgs=a.images;return '<div class="art-img-grid art-img-grid--'+Math.min(imgs.length,3)+'" data-imgs="'+esc(JSON.stringify(imgs))+'">'+imgs.map(function(u,i){return '<img src="'+esc(u)+'" alt="" loading="lazy" data-idx="'+i+'" class="art-img-thumb">';}).join('')+'</div>';})():'')+
      '<div class="art-actions">'+
      '<a href="'+a.url+'" target="_blank" rel="noopener" class="btn-read">阅读原文 ↗</a>'+
      '<button class="act-btn'+(liked?' is-liked':'')+'" id="modal-like-'+a.id+'" onclick="Interactions.like(\''+a.id+'\',this)">♥ <span>'+a.likes+'</span> 点赞</button>'+
      '<button class="act-btn'+(saved?' is-saved':'')+'" id="modal-save-'+a.id+'" onclick="Interactions.save(\''+a.id+'\',this)">◈ <span>'+(a.saves||0)+'</span> 收藏</button>'+
      '</div>'+
      '<div class="comments-section">'+
      '<div class="comments-head" id="comments-head-'+a.id+'">评论 ('+(a.commentsCount||a.comments&&a.comments.length||0)+')</div>'+
      commentArea+
      '<div id="comment-tree">'+commentsHtml+'</div>'+
      '</div>';
  },

  _renderCommentTree: function (comments, articleId) {
    if (!comments||!comments.length) return '<div class="no-comments">暂无评论</div>';

    var SHOW_DEFAULT = 3;
    var visible = comments.slice(0, SHOW_DEFAULT);
    var hidden  = comments.slice(SHOW_DEFAULT);

    var html = visible.map(function(c){ return Article._renderComment(c, articleId, 0, null); }).join('');

    if (hidden.length > 0) {
      html += '<div id="cmt-collapsed-'+articleId+'" class="cmt-collapsed" style="display:none">'+
        hidden.map(function(c){ return Article._renderComment(c, articleId, 0, null); }).join('')+
        '</div>';
      html += '<button class="cmt-show-more" onclick="Article.toggleComments(\''+articleId+'\',this)">'+
        '▼ 展开更多评论（'+hidden.length+'条）</button>';
    }

    return html;
  },

  toggleComments: function (articleId, btn) {
    var el = document.getElementById('cmt-collapsed-'+articleId);
    if (!el) return;
    var isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? '▲ 收起评论' : '▼ 展开更多评论';
  },

  _renderComment: function (c, articleId, depth, parentUser) {
    var indent = Math.min(depth, 3) * 20;
    var liked  = c.liked || false;

    // "X 回复 Y" prefix for replies
    var replyToHtml = (depth > 0 && parentUser)
      ? '<span class="cmt-reply-to">回复 <span class="cmt-reply-target">@'+esc(parentUser)+'</span> · </span>'
      : '';

    var replyBtn = State.currentUser
      ? '<button class="cmt-reply-btn" onclick="Article.startReply(\''+articleId+'\',\''+c.id+'\',\''+esc(c.user)+'\')">回复</button>'
      : '';

    var html = '<div class="comment-item" id="cmt-'+c.id+'" style="margin-left:'+indent+'px">'+
      '<div class="comment-meta">'+
      '<span class="comment-user" data-uid="'+c.userId+'" onclick="Profile.open(\''+c.userId+'\')" >@'+esc(c.user)+'</span>'+
      '<span class="comment-time">'+formatDate(c.date)+'</span>'+
      '<button class="cmt-like-btn'+(liked?' is-liked':'')+'" data-article-id="'+articleId+'" data-comment-id="'+c.id+'">'+
      '♥ <span class="cmt-like-count">'+(c.likes||0)+'</span></button>'+
      replyBtn+
      '</div>'+
      '<div class="comment-body">'+replyToHtml+esc(c.text)+'</div>'+
      '</div>';

    if (c.replies&&c.replies.length) {
      html += c.replies.map(function(r){ return Article._renderComment(r, articleId, depth+1, c.user); }).join('');
    }
    return html;
  },

  commentKey: function (e, id) {
    if (e.ctrlKey && e.keyCode===13) Article.postComment(id, null);
  },

  startReply: function (articleId, parentId, parentUser) {
    // Insert an inline reply box under the parent comment
    var existing = document.getElementById('inline-reply-'+parentId);
    if (existing) { existing.remove(); return; }

    var wrap = document.createElement('div');
    wrap.id = 'inline-reply-'+parentId;
    wrap.className = 'inline-reply-wrap';
    wrap.style.marginLeft = '20px';
    wrap.innerHTML =
      '<div class="reply-to-label">回复 @'+esc(parentUser)+'</div>'+
      '<div class="comment-input-wrap">'+
      '<textarea id="reply-ta-'+parentId+'" placeholder="输入回复… (Ctrl+Enter)" '+
      'onkeydown="Article.replyKey(event,\''+articleId+'\',\''+parentId+'\')"></textarea>'+
      '<button class="btn-comment" onclick="Article.postComment(\''+articleId+'\',\''+parentId+'\')">发送 ▶</button>'+
      '</div>';

    var parentEl = document.getElementById('cmt-'+parentId);
    if (parentEl) {
      parentEl.after(wrap);
      var ta = document.getElementById('reply-ta-'+parentId);
      if (ta) ta.focus();
    }
  },

  replyKey: function (e, articleId, parentId) {
    if (e.ctrlKey && e.keyCode===13) Article.postComment(articleId, parentId);
  },

  postComment: function (id, parentId) {
    if (!State.currentUser) return;
    var taId = parentId ? 'reply-ta-'+parentId : 'comment-ta';
    var ta   = document.getElementById(taId);
    var text = ta ? ta.value.trim() : '';
    if (!text) { Toast.show('评论不能为空', true); return; }

    API.postComment(id, State.currentUser.id, State.currentUser.username, text, parentId)
      .then(function(){
        if (parentId) {
          var box = document.getElementById('inline-reply-'+parentId);
          if (box) box.remove();
        }
        return API.getArticle(id).then(function(a){
          Article._render(a);
          // Update comment count on card in feed
          document.querySelectorAll('[data-action="comment"][data-id="'+id+'"]').forEach(function(b){
            b.innerHTML = '💬 '+(a.commentsCount||0);
          });
        });
      })
      .then(function(){
        App.renderStats();
        Toast.show('评论已发布 ▶');
        Notifications.pollUnread();
      })
      .catch(function(e){ Toast.show('发布失败：'+(e.message||''), true); });
  }
};

// Delegate comment like clicks
document.addEventListener('click', function(e){
  var btn = e.target.closest('.cmt-like-btn');
  if (!btn) return;
  e.stopPropagation();
  var aid = btn.dataset.articleId, cid = btn.dataset.commentId;
  if (aid && cid) Interactions.likeComment(aid, cid, btn);
});

/* ══════════════════════════════════════════════════════════
   USER PROFILE
   ══════════════════════════════════════════════════════════ */
var Profile = {
  open: function (uid) {
    if (!uid) return;
    Promise.all([
      API.getProfile(uid),
      API.getProfileArticles(uid),
      API.getProfileComments(uid),
    ]).then(function(res){
      Profile._render(res[0], res[1]||[], res[2]||[]);
      Dialog.open('dlg-profile');
    }).catch(function(){ Toast.show('加载用户信息失败', true); });
  },

  _render: function (profile, articles, comments) {
    var isSelf      = State.currentUser && State.currentUser.id === profile.id;
    var isFollowing = profile.isFollowing;

    var followBtn = '';
    if (State.currentUser && !isSelf) {
      followBtn = '<button class="btn-follow'+(isFollowing?' is-following':'')+'" id="follow-btn-'+profile.id+'" '+
        'onclick="Profile.toggleFollow(\''+profile.id+'\')">'+(isFollowing?'✓ 已关注':'＋ 关注')+'</button>';
    }

    var articlesHtml = articles.length
      ? articles.map(function(a){
          return '<div class="profile-card" onclick="Dialog.close(\'dlg-profile\');setTimeout(function(){Article.open(\''+a.id+'\');},120)">'+
            '<span class="profile-card-emoji">'+(a.emoji||'📰')+'</span>'+
            '<div class="profile-card-body">'+
            '<div class="profile-art-title">'+esc(a.title)+'</div>'+
            (a.desc?'<div class="profile-card-preview">'+esc(a.desc)+'</div>':'')+
            '<div class="profile-art-meta">'+esc(a.source)+' · '+formatDate(a.date)+' · ♥ '+a.likes+'</div>'+
            '</div></div>';
        }).join('')
      : '<div class="profile-empty" style="padding:20px">暂无发布内容</div>';

    var commentsHtml = comments.length
      ? comments.map(function(c){
          return '<div class="profile-card" onclick="Dialog.close(\'dlg-profile\');setTimeout(function(){Article.open(\''+c.articleId+'\');},120)">' +
            '<span class="profile-card-emoji">💬</span>'+
            '<div class="profile-card-body">'+
            '<div class="profile-cmt-article">'+(c.parentId?'回复 @'+esc(c.parentUsername||''):' 评论了《'+esc(c.articleTitle)+'》')+'</div>'+
            '<div class="profile-card-preview">'+esc(c.text)+'</div>'+
            '<div class="profile-cmt-meta">'+formatDate(c.date)+' · ♥ '+c.likes+'</div>'+
            '</div></div>';
        }).join('')
      : '<div class="profile-empty" style="padding:20px">暂无评论记录</div>';

    document.getElementById('dlg-profile-body').innerHTML =
      '<div style="padding:16px 20px;border-bottom:1px solid var(--border)">'+
      '<div style="display:flex;align-items:center;gap:12px">'+
      '<div class="profile-avatar">'+profile.username[0].toUpperCase()+'</div>'+
      '<div class="profile-info" style="flex:1">'+
      '<div class="profile-username">'+esc(profile.username)+'</div>'+
      '<div class="profile-stats-row">'+
      '<span class="profile-stat"><strong>'+profile.followers+'</strong> 粉丝</span>'+
      '<span class="profile-stat"><strong>'+profile.following+'</strong> 关注</span>'+
      '<span class="profile-stat"><strong>'+profile.articleCount+'</strong> 文章</span>'+
      '</div>'+
      '<div class="profile-join">注册于 '+formatDate(profile.joinDate)+'</div>'+
      '</div>'+
      (followBtn ? '<div style="flex-shrink:0">'+followBtn+'</div>' : '')+
      '</div></div>'+
      '<div style="display:flex;border-bottom:1px solid var(--border)">'+
      '<button class="upanel-tab active" onclick="Profile._switchTab(\'articles\',this)">发布的文章</button>'+
      '<button class="upanel-tab" onclick="Profile._switchTab(\'comments\',this)">评论记录</button>'+
      '</div>'+
      '<div id="profile-tab-articles" style="padding:8px 0">'+articlesHtml+'</div>'+
      '<div id="profile-tab-comments" style="padding:8px 0;display:none">'+commentsHtml+'</div>';
  },

  _switchTab: function (tab, btn) {
    document.getElementById('profile-tab-articles').style.display = tab==='articles' ? 'block' : 'none';
    document.getElementById('profile-tab-comments').style.display = tab==='comments' ? 'block' : 'none';
    btn.closest('div').querySelectorAll('.upanel-tab').forEach(function(b){
      b.classList.toggle('active', b === btn);
    });
  },

  toggleFollow: function (uid) {
    if (!State.currentUser) { Toast.show('请先登录', true); Dialog.open('dlg-login'); return; }
    API.toggleFollow(uid).then(function(r){
      var btn = document.getElementById('follow-btn-'+uid);
      if (btn) {
        btn.className = 'btn-follow'+(r.following?' is-following':'');
        btn.textContent = r.following ? '✓ 已关注' : '＋ 关注';
      }
      Toast.show(r.following ? '已关注' : '已取消关注');
      Notifications.pollUnread();
    }).catch(function(){ Toast.show('操作失败', true); });
  }
};

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS
   ══════════════════════════════════════════════════════════ */
var Notifications = {
  _timer: null,

  start: function () {
    Notifications.pollUnread();
    Notifications._timer = setInterval(Notifications.pollUnread, 30000);
  },

  stop: function () {
    if (Notifications._timer) clearInterval(Notifications._timer);
  },

  pollUnread: function () {
    if (!State.currentUser) return;
    API.getUnreadCount().then(function(r){
      State.unreadCount = r.count||0;
      Notifications._renderBadge();
    }).catch(function(){});
  },

  _renderBadge: function () {
    var badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (State.unreadCount > 0) {
      badge.textContent = State.unreadCount > 99 ? '99+' : State.unreadCount;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  },

  open: function () {
    if (!State.currentUser) { Toast.show('请先登录', true); Dialog.open('dlg-login'); return; }
    API.getNotifications().then(function(items){
      Notifications._render(items||[]);
      Dialog.open('dlg-notifications');
      // Mark all read after opening
      API.markAllRead().then(function(){
        State.unreadCount = 0;
        Notifications._renderBadge();
      });
    }).catch(function(){ Toast.show('加载通知失败', true); });
  },

  _render: function (items) {
    var typeLabel = {
      'follow':       '关注了你',
      'comment':      '评论了你的文章',
      'reply':        '回复了你的评论',
      'like_article': '点赞了你的文章',
      'like_comment': '点赞了你的评论',
      'save':         '收藏了你的文章',
    };

    var html = items.length ? items.map(function(n){
      var label = typeLabel[n.type] || n.type;

      // Content preview line
      var preview = '';
      if (n.articleTitle && (n.type==='like_article'||n.type==='save'||n.type==='comment')) {
        preview = '<div class="notif-preview">📰 '+esc(n.articleTitle)+'</div>';
      } else if (n.commentBody && (n.type==='reply'||n.type==='like_comment')) {
        preview = '<div class="notif-preview">💬 '+esc(n.commentBody)+'</div>';
      }

      var link = '';
      if (n.articleId) {
        link = '<button class="notif-link" onclick="Dialog.close(\'dlg-notifications\');Article.open(\''+n.articleId+'\''+(n.commentId?',true':'')+')">查看 →</button>';
      }
      return '<div class="notif-item'+(n.isRead?'':' is-unread')+'">'+
        '<div class="notif-meta">'+
          '<span class="notif-actor" onclick="Profile.open(\''+n.actorId+'\')">@'+esc(n.actorName)+'</span>'+
        '<span class="notif-action">'+label+'</span>'+
        '<span class="notif-time">'+formatDate(n.date)+'</span>'+
        '</div>'+
        preview+
        link+
        '</div>';
    }).join('') : '<div class="notif-empty">暂无通知</div>';

    document.getElementById('notif-list').innerHTML = html;
  }
};

/* ══════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════ */
var Auth = {
  renderHeader: function () {
    var area = document.getElementById('auth-area');
    if (!State.currentUser) {
      area.innerHTML =
        '<button class="btn-sm btn-sm-ghost" id="btn-login">登录</button>'+
        '<button class="btn-sm btn-sm-red" id="btn-signup">注册</button>';
      document.getElementById('btn-login').addEventListener('click', function(){ Dialog.open('dlg-login'); });
      document.getElementById('btn-signup').addEventListener('click', function(){ Dialog.open('dlg-signup'); });
      Notifications.stop();
    } else {
      var u = State.currentUser;
      var adminBtn = u.isAdmin ? '<button class="btn-sm btn-sm-admin" id="btn-admin">管理后台</button>' : '';
      area.innerHTML =
        '<button class="btn-sm btn-sm-ghost" id="btn-publish-quick">＋ 发布</button>'+
        adminBtn+
        '<button class="btn-sm btn-sm-ghost notif-btn" id="btn-notif">'+
        '🔔 <span id="notif-badge" hidden></span></button>'+
        '<button class="btn-sm btn-sm-ghost" id="btn-user-panel">'+u.username[0].toUpperCase()+'</button>';

      // Use setTimeout to ensure DOM is updated before binding events
      setTimeout(function(){
        var publishBtn = document.getElementById('btn-publish-quick');
        if (publishBtn) publishBtn.addEventListener('click', function(){
          u.isAdmin ? Admin.open() : Admin.openPublishOnly();
        });
        if (u.isAdmin) {
          var adminBtnEl = document.getElementById('btn-admin');
          if (adminBtnEl) adminBtnEl.addEventListener('click', Admin.open);
        }
        var notifBtn = document.getElementById('btn-notif');
        if (notifBtn) notifBtn.addEventListener('click', Notifications.open);
        var userBtn = document.getElementById('btn-user-panel');
        if (userBtn) userBtn.addEventListener('click', function(){
          UserPanel.open();
        });
        Notifications.start();
      }, 0);
    }
  },

  doLogin: function () {
    var email = document.getElementById('login-email').value.trim();
    var pw    = document.getElementById('login-password').value;
    var err   = document.getElementById('login-err');
    err.hidden = true;
    API.login(email, pw).then(function(r){
      State.currentUser = r.user;
      return Promise.all([API.getUserLikes(r.user.id), API.getUserSaves(r.user.id)]);
    }).then(function(results){
      State.userLikes = results[0]||[];
      State.userSaves = results[1]||[];
      Dialog.close('dlg-login');
      Auth.renderHeader();
      App.refresh().catch(function(){});
      Toast.show('欢迎回来，'+State.currentUser.username);
    }).catch(function(){ err.hidden = false; });
  },

  doSignup: function () {
    var uname = document.getElementById('signup-username').value.trim();
    var email = document.getElementById('signup-email').value.trim();
    var pw    = document.getElementById('signup-password').value;
    var err   = document.getElementById('signup-err');
    err.hidden = true;
    if (!uname||!email||!pw){ Toast.show('请填写所有字段',true); return; }
    if (pw.length<6){ Toast.show('密码至少6位',true); return; }
    API.signup(uname, email, pw).then(function(r){
      State.currentUser = r.user;
      State.userLikes=[]; State.userSaves=[];
      Dialog.close('dlg-signup');
      Auth.renderHeader();
      App.refresh().catch(function(){});
      Toast.show('欢迎加入，'+r.user.username+(r.user.isAdmin?'（管理员）':'')+' ✓');
    }).catch(function(e){
      if (e.code==='EMAIL_EXISTS') {
        err.textContent = '⚠ 该邮箱已被注册';
        err.hidden = false;
      } else if (e.code==='USERNAME_EXISTS') {
        err.textContent = '⚠ 该用户名已被使用';
        err.hidden = false;
      } else {
        Toast.show('注册失败，请稍后重试', true);
      }
    });
  },

  doLogout: function () {
    API.logout().then(function(){
      State.currentUser=null; State.userLikes=[]; State.userSaves=[];
      Dialog.close('dlg-user');
      Auth.renderHeader();
      App.refresh();
      Toast.show('已安全退出');
    });
  }
};

/* ══════════════════════════════════════════════════════════
   USER PANEL (my own profile)
   ══════════════════════════════════════════════════════════ */
var UserPanel = {
  _currentTab: 'articles',

  open: function () {
    var u = State.currentUser;
    if (!u) return;
    Dialog.open('dlg-user');
    // Load follow stats for header
    API.getFollowStats(u.id).then(function(stats){
      document.getElementById('user-panel-header').innerHTML =
        '<div style="display:flex;align-items:center;gap:12px">'+
        '<div class="profile-avatar" style="width:44px;height:44px;font-size:18px">'+u.username[0].toUpperCase()+'</div>'+
        '<div>'+
        '<div style="font-family:var(--head);font-size:16px;font-weight:700;color:var(--text-bright)">'+esc(u.username)+'</div>'+
        '<div style="font-family:var(--mono);font-size:11px;color:var(--text-dim);margin-bottom:4px">'+esc(u.email)+(u.isAdmin?' · 管理员':'')+'</div>'+
        '<div style="display:flex;gap:14px">'+
        '<span style="font-family:var(--mono);font-size:11px;color:var(--text-dim)"><strong style="color:var(--text-bright)">'+(stats.followers||0)+'</strong> 粉丝</span>'+
        '<span style="font-family:var(--mono);font-size:11px;color:var(--text-dim)"><strong style="color:var(--text-bright)">'+(stats.following||0)+'</strong> 关注</span>'+
        '</div>'+
        '</div></div>';
    }).catch(function(){
      document.getElementById('user-panel-header').innerHTML =
        '<div style="display:flex;align-items:center;gap:12px">'+
        '<div class="profile-avatar" style="width:44px;height:44px;font-size:18px">'+u.username[0].toUpperCase()+'</div>'+
        '<div>'+
        '<div style="font-family:var(--head);font-size:16px;font-weight:700;color:var(--text-bright)">'+esc(u.username)+'</div>'+
        '<div style="font-family:var(--mono);font-size:11px;color:var(--text-dim)">'+esc(u.email)+(u.isAdmin?' · 管理员':'')+'</div>'+
        '</div></div>';
    });
    UserPanel.switchTab('articles');
    document.querySelectorAll('.upanel-tab').forEach(function(btn){
      btn.onclick = function(){ UserPanel.switchTab(btn.dataset.utab); };
    });
  },

  switchTab: function (tab) {
    UserPanel._currentTab = tab;
    document.querySelectorAll('.upanel-tab').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.utab === tab);
    });
    var body = document.getElementById('user-panel-body');
    body.innerHTML = '<div style="padding:20px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--text-dim)">加载中…</div>';

    if (tab === 'articles') {
      API.getProfileArticles(State.currentUser.id).then(function(arts){
        if (!arts||!arts.length) { body.innerHTML = '<div class="profile-empty" style="padding:20px">暂无发布内容</div>'; return; }
        body.innerHTML = arts.map(function(a){
          return '<div class="profile-card" style="margin:4px 8px;justify-content:space-between">'+
            '<div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0" onclick="Dialog.close(\'dlg-user\');Article.open(\''+a.id+'\');" >'+
            '<span class="profile-card-emoji">'+(a.emoji||'📰')+'</span>'+
            '<div class="profile-card-body">'+
            '<div class="profile-art-title">'+esc(a.title)+'</div>'+
            (a.desc?'<div class="profile-card-preview">'+esc(a.desc)+'</div>':'')+
            '<div class="profile-art-meta">'+esc(a.source)+' · '+formatDate(a.date)+' · ♥ '+a.likes+'</div>'+
            '</div></div>'+
            '<button class="upanel-del-btn" onclick="UserPanel.deleteArticle(\''+a.id+'\',this)">删除</button>'+
            '</div>';
        }).join('');
      }).catch(function(){ body.innerHTML = '<div class="profile-empty" style="padding:20px">加载失败</div>'; });

    } else if (tab === 'comments') {
      API.getProfileComments(State.currentUser.id).then(function(cmts){
        if (!cmts||!cmts.length) { body.innerHTML = '<div class="profile-empty" style="padding:20px">暂无评论记录</div>'; return; }
        body.innerHTML = cmts.map(function(c){
          return '<div class="profile-card" style="margin:4px 8px;justify-content:space-between">'+
            '<div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0" onclick="Dialog.close(\'dlg-user\');Article.open(\''+c.articleId+'\');" >'+
            '<span class="profile-card-emoji">💬</span>'+
            '<div class="profile-card-body">'+
            '<div class="profile-cmt-article">'+(c.parentId?'回复 @'+esc(c.parentUsername||''):' 评论了《'+esc(c.articleTitle)+'》')+'</div>'+
            '<div class="profile-card-preview">'+esc(c.text)+'</div>'+
            '<div class="profile-cmt-meta">'+formatDate(c.date)+'</div>'+
            '</div></div>'+
            '<button class="upanel-del-btn" onclick="UserPanel.deleteComment(\''+c.id+'\',\''+c.articleId+'\',this)">删除</button>'+
            '</div>';
        }).join('');
      }).catch(function(){ body.innerHTML = '<div class="profile-empty" style="padding:20px">加载失败</div>'; });

    } else if (tab === 'saved') {
      API.getUserSaves(State.currentUser.id).then(function(ids){
        if (!ids||!ids.length) { body.innerHTML = '<div class="profile-empty" style="padding:20px">暂无收藏</div>'; return; }
        return API.getArticles({}).then(function(arts){
          var saved = ids.map(function(id){ return (arts||[]).find(function(a){return a.id===id;}); }).filter(Boolean);
          if (!saved.length) { body.innerHTML = '<div class="profile-empty" style="padding:20px">暂无收藏</div>'; return; }
          body.innerHTML = saved.map(function(a){
            return '<div class="profile-card" style="margin:4px 8px;justify-content:space-between">'+
              '<div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0" onclick="Dialog.close(\'dlg-user\');setTimeout(function(){Article.open(\''+a.id+'\');},120)">'+
              '<span class="profile-card-emoji">'+(a.emoji||'📰')+'</span>'+
              '<div class="profile-card-body">'+
              '<div class="profile-art-title">'+esc(a.title)+'</div>'+
              (a.desc?'<div class="profile-card-preview">'+esc(a.desc)+'</div>':'')+
              '<div class="profile-art-meta">'+esc(a.source)+'</div>'+
              '</div></div>'+
              '<button class="upanel-del-btn" onclick="UserPanel.unsave(\''+a.id+'\',this)">取消收藏</button>'+
              '</div>';
          }).join('');
        });
      }).catch(function(){ body.innerHTML = '<div class="profile-empty" style="padding:20px">加载失败</div>'; });
    }
  },

  deleteArticle: function (id, btn) {
    if (!confirm('确认删除这篇文章？')) return;
    API.deleteArticle(id).then(function(){
      var row = btn.closest('.upanel-item');
      if (row) row.remove();
      App.renderFeed();
      Toast.show('文章已删除');
    }).catch(function(){ Toast.show('删除失败', true); });
  },

  deleteComment: function (commentId, articleId, btn) {
    if (!confirm('确认删除这条评论？')) return;
    API.deleteComment(articleId, commentId).then(function(){
      var row = btn.closest('.upanel-item');
      if (row) row.remove();
      Toast.show('评论已删除');
    }).catch(function(){ Toast.show('删除失败', true); });
  },

  unsave: function (id, btn) {
    API.toggleSave(id).then(function(){
      var idx = State.userSaves.indexOf(id);
      if (idx>=0) State.userSaves.splice(idx,1);
      var row = btn.closest('.upanel-item');
      if (row) row.remove();
      App.renderFeed();
      Toast.show('已取消收藏');
    }).catch(function(){ Toast.show('操作失败', true); });
  }
};

/* ══════════════════════════════════════════════════════════
   ADMIN
   ══════════════════════════════════════════════════════════ */
var Admin = {
  open: function () {
    if (!State.currentUser||!State.currentUser.isAdmin){ Toast.show('权限不足',true); return; }
    API.getTabs().then(function(tabs){
      var sel = document.getElementById('pub-category');
      if (sel) sel.innerHTML = (tabs||[]).filter(function(t){return t!=='全部';})
        .map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('');
      Admin.switchTab('publish');
      Dialog.open('dlg-admin');
      ImageUpload.init('pub');
    }).catch(function(){ Admin.switchTab('publish'); Dialog.open('dlg-admin'); ImageUpload.init('pub'); });
  },

  openPublishOnly: function () {
    if (!State.currentUser){ Toast.show('请先登录',true); return; }
    API.getTabs().then(function(tabs){
      var sel = document.getElementById('pub2-category');
      if (sel) sel.innerHTML = (tabs||[]).filter(function(t){return t!=='全部';})
        .map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('');
      Dialog.open('dlg-publish');
      ImageUpload.init('pub2');
    }).catch(function(){ Dialog.open('dlg-publish'); ImageUpload.init('pub2'); });
  },

  switchTab: function (tab) {
    var dlg = document.getElementById('dlg-admin');
    dlg.querySelectorAll('.admin-tab').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.tab===tab);
    });
    dlg.querySelectorAll('.atab-panel').forEach(function(panel){
      panel.hidden = panel.id!=='atab-'+tab;
    });
    if (tab==='manage') Admin._renderManage();
    if (tab==='cats')   Admin._renderCats();
  },

  _refreshCatSelect: function () {
    API.getTabs().then(function(tabs){
      var sel = document.getElementById('pub-category');
      sel.innerHTML = (tabs||[]).filter(function(t){return t!=='全部';})
        .map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('');
    });
  },

  publish2: function () {
    var title    = document.getElementById('pub2-title').value.trim();
    var source   = document.getElementById('pub2-source').value.trim();
    var url      = document.getElementById('pub2-url').value.trim();
    var category = document.getElementById('pub2-category').value;
    var desc     = document.getElementById('pub2-desc').value.trim();
    var emoji    = document.getElementById('pub2-emoji').value.trim()||'📡';
    var alert    = document.getElementById('pub2-alert').value;
    if (!title){ Toast.show('请填写文章标题',true); return; }
    if (!source){ Toast.show('请填写来源媒体',true); return; }
    if (!url){ Toast.show('请填写原文链接',true); return; }
    if (!/^https?:\/\//i.test(url)){ Toast.show('链接须以 http:// 或 https:// 开头',true); return; }
    if (!category){ Toast.show('请选择分类',true); return; }
    Toast.show('上传中…');
    ImageUpload.uploadAll('pub2').then(function(images){
      return API.publishArticle({title,source,url,category,desc,emoji,alertLevel:alert,featured:false,images});
    }).then(function(){
        ['pub2-title','pub2-source','pub2-url','pub2-desc','pub2-emoji'].forEach(function(id){
          document.getElementById(id).value='';
        });
        document.getElementById('pub2-alert').value='';
        ImageUpload.reset('pub2');
        Dialog.close('dlg-publish');
        App.refresh();
        Toast.show('文章已发布 ✓');
      }).catch(function(e){ Toast.show('发布失败：'+(e.message||''),true); });
  },

  publish: function () {
    var title    = document.getElementById('pub-title').value.trim();
    var source   = document.getElementById('pub-source').value.trim();
    var url      = document.getElementById('pub-url').value.trim();
    var category = document.getElementById('pub-category').value;
    var desc     = document.getElementById('pub-desc').value.trim();
    var emoji    = document.getElementById('pub-emoji').value.trim()||'📡';
    var alert    = document.getElementById('pub-alert').value;
    var featured = document.getElementById('pub-featured').checked;
    if (!title){ Toast.show('请填写文章标题',true); return; }
    if (!source){ Toast.show('请填写来源媒体',true); return; }
    if (!url){ Toast.show('请填写原文链接',true); return; }
    if (!/^https?:\/\//i.test(url)){ Toast.show('链接须以 http:// 或 https:// 开头',true); return; }
    if (!category){ Toast.show('请选择分类',true); return; }
    Toast.show('上传中…');
    ImageUpload.uploadAll('pub').then(function(images){
      return API.publishArticle({title,source,url,category,desc,emoji,alertLevel:alert,featured,images});
    }).then(function(){
        ['pub-title','pub-source','pub-url','pub-desc','pub-emoji'].forEach(function(id){
          document.getElementById(id).value='';
        });
        document.getElementById('pub-alert').value='';
        document.getElementById('pub-featured').checked=false;
        ImageUpload.reset('pub');
        Dialog.close('dlg-admin');
        App.refresh();
        Toast.show('战报已发布 ✓');
      }).catch(function(e){ Toast.show('发布失败：'+(e.message||''),true); });
  },

  _renderManage: function () {
    API.getArticles({}).then(function(arts){
      var el = document.getElementById('manage-list');
      if (!arts||!arts.length){ el.innerHTML='<div style="padding:20px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--text-dim)">// EMPTY</div>'; return; }
      el.innerHTML = arts.map(function(a){
        return '<div class="manage-row">'+
          '<div class="manage-title"><span class="manage-src">'+esc(a.source)+'</span>'+esc(a.title)+'</div>'+
          '<button class="btn-del" data-del-id="'+a.id+'">DELETE</button></div>';
      }).join('');
      el.querySelectorAll('[data-del-id]').forEach(function(btn){
        btn.addEventListener('click', function(){
          if (!confirm('确认删除？')) return;
          API.deleteArticle(btn.dataset.delId).then(function(){ App.refresh(); Admin._renderManage(); Toast.show('已删除'); });
        });
      });
    });
  },

  _renderCats: function () {
    API.getTabs().then(function(tabs){
      var el = document.getElementById('cats-manage-list');
      el.innerHTML = (tabs||[]).filter(function(t){return t!=='全部';}).map(function(t){
        return '<div class="manage-row"><div class="manage-title">'+t+'</div>'+
          '<button class="btn-del" data-del-tab="'+t+'">DELETE</button></div>';
      }).join('');
      el.querySelectorAll('[data-del-tab]').forEach(function(btn){
        btn.addEventListener('click', function(){
          if (!confirm('删除分类「'+btn.dataset.delTab+'」？')) return;
          API.deleteTab(btn.dataset.delTab).then(function(){
            if (State.currentTab===btn.dataset.delTab) State.currentTab='全部';
            App.refresh(); Admin._renderCats(); Admin._refreshCatSelect(); Toast.show('分类已删除');
          });
        });
      });
    });
  }
};

/* ══════════════════════════════════════════════════════════
   DIALOG CONTROLLER
   ══════════════════════════════════════════════════════════ */
var Dialog = {
  initAll: function () {
    document.querySelectorAll('[data-close]').forEach(function(btn){
      btn.addEventListener('click', function(){ Dialog.close(btn.dataset.close); });
    });
    document.querySelectorAll('[data-open]').forEach(function(a){
      a.addEventListener('click', function(e){
        e.preventDefault();
        if (a.dataset.closeFrom) Dialog.close(a.dataset.closeFrom);
        Dialog.open(a.dataset.open);
      });
    });
    document.getElementById('backdrop').addEventListener('click', Dialog.closeAll);
    document.getElementById('dlg-admin').querySelectorAll('.admin-tab').forEach(function(btn){
      btn.addEventListener('click', function(){ Admin.switchTab(btn.dataset.tab); });
    });
    document.getElementById('btn-do-login').addEventListener('click', Auth.doLogin);
    document.getElementById('btn-do-signup').addEventListener('click', Auth.doSignup);
    document.getElementById('btn-logout').addEventListener('click', Auth.doLogout);
    document.getElementById('btn-publish').addEventListener('click', Admin.publish);
    document.getElementById('btn-publish2').addEventListener('click', Admin.publish2);
    document.getElementById('btn-add-cat').addEventListener('click', function(){
      var inp  = document.getElementById('new-cat');
      var name = inp.value.trim();
      if (!name) return;
      API.addTab(name).then(function(){
        inp.value=''; App.refresh(); Admin._renderCats(); Admin._refreshCatSelect();
        Toast.show('分类「'+name+'」已添加');
      }).catch(function(e){ Toast.show(e.code==='TAB_EXISTS'?'该分类已存在':'操作失败',true); });
    });
    document.getElementById('search-input').addEventListener('input', function(){
      State.searchQuery = this.value.trim(); App.renderFeed();
    });
    document.getElementById('search-btn').addEventListener('click', function(){
      State.searchQuery = document.getElementById('search-input').value.trim(); App.renderFeed();
    });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') Dialog.closeAll(); });

    // Wheel scroll on tabs row (horizontal scroll with mouse wheel)
    var tabsRow = document.getElementById('tabs-row');
    if (tabsRow) {
      tabsRow.addEventListener('wheel', function(e){
        if (e.deltaY !== 0) {
          e.preventDefault();
          tabsRow.scrollLeft += e.deltaY * 0.8;
        }
      }, { passive: false });
    }
  },

  open: function (id) {
    var dlg = document.getElementById(id);
    if (!dlg) return;
    document.querySelectorAll('.dialog.is-open').forEach(function(d){ if(d.id!==id) d.classList.remove('is-open'); });
    document.getElementById('backdrop').hidden = false;
    dlg.classList.add('is-open');
  },

  close: function (id) {
    var dlg = document.getElementById(id);
    if (dlg) dlg.classList.remove('is-open');
    if (!document.querySelector('.dialog.is-open')) document.getElementById('backdrop').hidden = true;
  },

  closeAll: function () {
    document.querySelectorAll('.dialog.is-open').forEach(function(d){ d.classList.remove('is-open'); });
    document.getElementById('backdrop').hidden = true;
  }
};

/* ══════════════════════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════════════════════ */
var Toast = {
  show: function (msg, isErr) {
    var box = document.getElementById('toast-container');
    var el  = document.createElement('div');
    el.className = 'toast'+(isErr?' err':'');
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ el.classList.add('show'); }); });
    setTimeout(function(){
      el.classList.remove('show');
      setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 250);
    }, 2800);
  }
};

/* ══════════════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════════════ */
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(iso) {
  if (!iso) return '';
  var d = new Date(iso), now = new Date();
  var diff = Math.floor((now-d)/1000);
  if (diff<60)     return '刚刚';
  if (diff<3600)   return Math.floor(diff/60)+'分钟前';
  if (diff<86400)  return Math.floor(diff/3600)+'小时前';
  if (diff<604800) return Math.floor(diff/86400)+'天前';
  var pad=function(n){return n<10?'0'+n:n;};
  return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
}
function switchTab(tab) { App.switchTab(tab); }

/* ══════════════════════════════════════════════════════════
   MOBILE NAV
   ══════════════════════════════════════════════════════════ */
var MobileNav = {
  _isMobile: function () { return window.innerWidth <= 700; },

  init: function () {
    if (!MobileNav._isMobile()) return;

    // Mirror tabs from desktop into mobile header
    MobileNav._mirrorTabs();

    // Search: focus triggers active state, Enter searches, cancel clears
    var searchInput = document.getElementById('mobile-search-input');
    var cancelBtn   = document.getElementById('mobile-search-cancel');
    var mHeader     = document.getElementById('mobile-header');

    if (searchInput) {
      searchInput.addEventListener('focus', function () {
        mHeader && mHeader.classList.add('search-active');
      });
      searchInput.addEventListener('input', function () {
        var q = searchInput.value.trim();
        // Live search with debounce
        clearTimeout(MobileNav._searchTimer);
        MobileNav._searchTimer = setTimeout(function () {
          State.searchQuery = q;
          App.loadFeed();
        }, 400);
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          clearTimeout(MobileNav._searchTimer);
          State.searchQuery = searchInput.value.trim();
          App.loadFeed();
          searchInput.blur();
        }
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        searchInput.value = '';
        State.searchQuery = '';
        mHeader && mHeader.classList.remove('search-active');
        searchInput.blur();
        App.loadFeed();
      });
    }

    // "我的" page logout button
    var logoutBtn = document.getElementById('mpage-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        Auth.logout();
        MobileNav.go('home');
      });
    }

    // "我的" page tabs
    document.querySelectorAll('#mpage-me-tabs .upanel-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('#mpage-me-tabs .upanel-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        MobileNav._loadMeTab(btn.dataset.utab);
      });
    });

    // "通知" mark all read
    var readAllBtn = document.getElementById('mpage-notif-read-all');
    if (readAllBtn) {
      readAllBtn.addEventListener('click', function () {
        if (!State.currentUser) return;
        API.markAllNotificationsRead && API.markAllNotificationsRead(State.currentUser.id).then(function () {
          MobileNav._loadNotifPage();
          var navBadge = document.getElementById('mnav-badge');
          if (navBadge) navBadge.setAttribute('hidden', '');
        });
      });
    }
  },

  _searchTimer: null,

  _mirrorTabs: function () {
    var mobileTabsRow = document.getElementById('mobile-tabs-row');
    var desktopTabsRow = document.getElementById('tabs-row');
    if (!mobileTabsRow || !desktopTabsRow) return;

    function sync() {
      mobileTabsRow.innerHTML = '';
      desktopTabsRow.querySelectorAll('.tab-btn').forEach(function (btn) {
        var clone = btn.cloneNode(true);
        // Re-bind click: switch tab AND go back to home page view
        clone.addEventListener('click', function () {
          MobileNav._showPage(null); // ensure feed is visible
          MobileNav.setActive('home');
          // Trigger the original button's registered listeners
          var evt = new MouseEvent('click', { bubbles: false });
          // directly call App functions based on data
          var tab = btn.dataset && btn.dataset.feed === 'following'
            ? null : (btn.textContent || '').replace(/\d+/g,'').trim();
          if (btn.dataset && btn.dataset.feed === 'following') {
            App.switchFeed('following');
          } else {
            App.switchTab(tab || '全部');
          }
          // sync active
          mobileTabsRow.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
          clone.classList.add('active');
        });
        mobileTabsRow.appendChild(clone);
      });
    }

    sync();
    var observer = new MutationObserver(sync);
    observer.observe(desktopTabsRow, { childList: true });
  },

  // Show/hide full-screen mobile pages
  _showPage: function (pageId) {
    ['mpage-following','mpage-notif','mpage-me'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('is-active', id === pageId);
    });
    // Show/hide main feed
    var layout = document.getElementById('layout');
    var mobileHeader = document.getElementById('mobile-header');
    if (pageId) {
      if (layout) layout.style.display = 'none';
      if (mobileHeader) mobileHeader.style.display = 'none';
    } else {
      if (layout) layout.style.display = '';
      if (mobileHeader) mobileHeader.style.display = '';
    }
  },

  _loadFollowingPage: function () {
    var body = document.getElementById('mpage-following-body');
    if (!body) return;
    if (!State.currentUser) {
      body.innerHTML = '<div style="padding:40px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--text-dim)">请先登录查看关注动态</div>';
      return;
    }
    body.innerHTML = '<div style="padding:20px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--text-dim)">加载中…</div>';
    API.getArticles({ feed: 'following', userId: State.currentUser.id }).then(function (arts) {
      if (!arts || !arts.length) {
        body.innerHTML = '<div style="padding:40px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--text-dim)">还没有关注任何人，<br>去发现有趣的用户吧</div>';
        return;
      }
      body.innerHTML = arts.map(function (a, i) { return App.renderCard(a, i); }).join('');
    }).catch(function () {
      body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--red);font-family:var(--mono);font-size:11px">加载失败</div>';
    });
  },

  _loadNotifPage: function () {
    var list = document.getElementById('mpage-notif-list');
    if (!list) return;
    if (!State.currentUser) {
      list.innerHTML = '<div style="padding:40px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--text-dim)">请先登录查看通知</div>';
      return;
    }
    // Reuse the Notifications render logic
    Notifications._renderInto(list);
  },

  _loadMePage: function () {
    var header = document.getElementById('mpage-me-header');
    var logoutBtn = document.getElementById('mpage-logout-btn');
    if (!State.currentUser) {
      if (header) header.innerHTML = '<div style="text-align:center;padding:20px 0"><button class="btn-primary" onclick="Dialog.open(\'dlg-login\')">登录 / 注册</button></div>';
      if (logoutBtn) logoutBtn.style.display = 'none';
      var body = document.getElementById('mpage-me-body');
      if (body) body.innerHTML = '';
      return;
    }
    var u = State.currentUser;
    if (logoutBtn) logoutBtn.style.display = '';
    API.getFollowStats(u.id).then(function (stats) {
      if (header) header.innerHTML =
        '<div style="display:flex;align-items:center;gap:14px">'+
        '<div class="profile-avatar" style="width:48px;height:48px;font-size:20px">'+u.username[0].toUpperCase()+'</div>'+
        '<div style="flex:1">'+
        '<div style="font-family:var(--head);font-size:17px;font-weight:700;color:var(--text-bright);letter-spacing:1px">'+esc(u.username)+'</div>'+
        '<div style="font-family:var(--mono);font-size:11px;color:var(--text-dim);margin-top:3px">'+esc(u.email)+(u.isAdmin?' · 管理员':'')+'</div>'+
        '<div style="display:flex;gap:16px;margin-top:6px">'+
        '<span style="font-family:var(--mono);font-size:11px;color:var(--text-dim)"><strong style="color:var(--text-bright)">'+(stats.followers||0)+'</strong> 粉丝</span>'+
        '<span style="font-family:var(--mono);font-size:11px;color:var(--text-dim)"><strong style="color:var(--text-bright)">'+(stats.following||0)+'</strong> 关注</span>'+
        '</div></div></div>';
    });
    MobileNav._loadMeTab('articles');
  },

  _loadMeTab: function (tab) {
    var body = document.getElementById('mpage-me-body');
    if (!body || !State.currentUser) return;
    body.innerHTML = '<div style="padding:20px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--text-dim)">加载中…</div>';

    if (tab === 'articles') {
      API.getProfileArticles(State.currentUser.id).then(function (arts) {
        if (!arts || !arts.length) { body.innerHTML = '<div class="profile-empty" style="padding:20px">暂无发布内容</div>'; return; }
        body.innerHTML = arts.map(function (a) {
          return '<div class="profile-card" style="margin:4px 8px;justify-content:space-between">'+
            '<div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0" onclick="MobileNav._showPage(null);MobileNav.setActive(\'home\');Article.open(\''+a.id+'\');" >'+
            '<span class="profile-card-emoji">'+(a.emoji||'📰')+'</span>'+
            '<div class="profile-card-body">'+
            '<div class="profile-art-title">'+esc(a.title)+'</div>'+
            (a.desc?'<div class="profile-card-preview">'+esc(a.desc)+'</div>':'')+
            '<div class="profile-art-meta">'+esc(a.source)+' · '+formatDate(a.date)+' · ♥ '+a.likes+'</div>'+
            '</div></div>'+
            '<button class="upanel-del-btn" onclick="UserPanel.deleteArticle(\''+a.id+'\',this)">删除</button>'+
            '</div>';
        }).join('');
      });
    } else if (tab === 'comments') {
      API.getProfileComments(State.currentUser.id).then(function (cmts) {
        if (!cmts || !cmts.length) { body.innerHTML = '<div class="profile-empty" style="padding:20px">暂无评论记录</div>'; return; }
        body.innerHTML = cmts.map(function (c) {
          return '<div class="profile-card" style="margin:4px 8px;justify-content:space-between">'+
            '<div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0" onclick="MobileNav._showPage(null);MobileNav.setActive(\'home\');Article.open(\''+c.articleId+'\');" >'+
            '<span class="profile-card-emoji">💬</span>'+
            '<div class="profile-card-body">'+
            '<div class="profile-cmt-article">'+(c.parentId?'回复 @'+esc(c.parentUsername||''):'评论了《'+esc(c.articleTitle)+'》')+'</div>'+
            '<div class="profile-card-preview">'+esc(c.text)+'</div>'+
            '<div class="profile-cmt-meta">'+formatDate(c.date)+'</div>'+
            '</div></div>'+
            '<button class="upanel-del-btn" onclick="UserPanel.deleteComment(\''+c.id+'\',\''+c.articleId+'\',this)">删除</button>'+
            '</div>';
        }).join('');
      });
    } else if (tab === 'saved') {
      API.getUserSaves(State.currentUser.id).then(function (ids) {
        if (!ids || !ids.length) { body.innerHTML = '<div class="profile-empty" style="padding:20px">暂无收藏</div>'; return; }
        return API.getArticles({}).then(function (arts) {
          var saved = (ids||[]).map(function (id) { return (arts||[]).find(function (a) { return a.id===id; }); }).filter(Boolean);
          if (!saved.length) { body.innerHTML = '<div class="profile-empty" style="padding:20px">暂无收藏</div>'; return; }
          body.innerHTML = saved.map(function (a) {
            return '<div class="profile-card" style="margin:4px 8px;justify-content:space-between">'+
              '<div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0" onclick="MobileNav._showPage(null);MobileNav.setActive(\'home\');Article.open(\''+a.id+'\');" >'+
              '<span class="profile-card-emoji">'+(a.emoji||'📰')+'</span>'+
              '<div class="profile-card-body">'+
              '<div class="profile-art-title">'+esc(a.title)+'</div>'+
              (a.desc?'<div class="profile-card-preview">'+esc(a.desc)+'</div>':'')+
              '<div class="profile-art-meta">'+esc(a.source)+'</div>'+
              '</div></div>'+
              '<button class="upanel-del-btn" onclick="UserPanel.unsave(\''+a.id+'\',this)">取消收藏</button>'+
              '</div>';
          }).join('');
        });
      });
    }
  },

  syncBadge: function () {
    var headerBadge = document.getElementById('notif-badge');
    var navBadge    = document.getElementById('mnav-badge');
    if (!navBadge) return;
    if (headerBadge && !headerBadge.hidden && headerBadge.textContent) {
      navBadge.textContent = headerBadge.textContent;
      navBadge.removeAttribute('hidden');
    } else {
      navBadge.setAttribute('hidden', '');
    }
  },

  setActive: function (tab) {
    ['home','following','notif','me'].forEach(function (t) {
      var el = document.getElementById('mnav-' + t);
      if (el) el.classList.toggle('active', t === tab);
    });
  },

  go: function (tab) {
    if (!MobileNav._isMobile()) return;
    MobileNav.setActive(tab);

    if (tab === 'home') {
      MobileNav._showPage(null);

    } else if (tab === 'following') {
      MobileNav._showPage('mpage-following');
      MobileNav._loadFollowingPage();

    } else if (tab === 'notif') {
      MobileNav._showPage('mpage-notif');
      MobileNav._loadNotifPage();
      // clear badge
      var navBadge = document.getElementById('mnav-badge');
      if (navBadge) navBadge.setAttribute('hidden', '');

    } else if (tab === 'me') {
      if (!State.currentUser) {
        Dialog.open('dlg-login');
        MobileNav.setActive('home');
        return;
      }
      MobileNav._showPage('mpage-me');
      MobileNav._loadMePage();
    }
  },

  publish: function () {
    if (!State.currentUser) {
      Toast.show('请先登录', true);
      Dialog.open('dlg-login');
      return;
    }
    if (State.currentUser.isAdmin) {
      Dialog.open('dlg-admin');
      Admin.switchTab('publish');
    } else {
      Dialog.open('dlg-publish');
    }
  },

  updateMeIcon: function () {
    var icon = document.getElementById('mnav-me-icon');
    if (!icon) return;
    if (State.currentUser) {
      icon.textContent = State.currentUser.username[0].toUpperCase();
      icon.style.cssText = 'width:26px;height:26px;border-radius:50%;background:var(--olive);display:inline-flex;align-items:center;justify-content:center;font-family:var(--head);font-weight:700;font-size:13px;color:var(--text-bright);border:2px solid var(--olive-light)';
    } else {
      icon.textContent = '◈';
      icon.style.cssText = '';
    }
    // Refresh me page if open
    var mePage = document.getElementById('mpage-me');
    if (mePage && mePage.classList.contains('is-active')) {
      MobileNav._loadMePage();
    }
  }
};

// Patch Notifications to support rendering into arbitrary container
var _origNotifRender = null; // render patched below
Notifications._renderInto = function (container) {
  if (!State.currentUser) {
    container.innerHTML = '<div style="padding:40px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--text-dim)">请先登录</div>';
    return;
  }
  container.innerHTML = '<div style="padding:20px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--text-dim)">加载中…</div>';
  API.getNotifications(State.currentUser.id).then(function (notifs) {
    API.markNotificationsRead && API.markNotificationsRead(State.currentUser.id);
    var navBadge = document.getElementById('mnav-badge');
    if (navBadge) navBadge.setAttribute('hidden', '');
    if (!notifs || !notifs.length) {
      container.innerHTML = '<div class="notif-empty">暂无通知</div>';
      return;
    }
    container.innerHTML = notifs.map(function (n) {
      var action = n.type === 'like' ? '点赞了你的文章' : n.type === 'save' ? '收藏了你的文章' : n.type === 'comment' ? '评论了你的文章' : n.type === 'reply' ? '回复了你' : n.type === 'follow' ? '关注了你' : n.type === 'comment_like' ? '点赞了你的评论' : '';
      var link = n.articleId
        ? '<button class="notif-link" onclick="MobileNav._showPage(null);MobileNav.setActive(\'home\');Article.open(\''+n.articleId+'\''+(n.commentId?',true':'')+')">查看 →</button>'
        : '';
      return '<div class="notif-item'+(n.isRead?'':' is-unread')+'">'+
        '<div class="notif-meta">'+
        '<span class="notif-actor" onclick="Profile.open(\''+n.actorId+'\')">'+ esc(n.actorName)+'</span>'+
        '<span class="notif-action">'+action+'</span>'+
        '<span class="notif-time">'+formatDate(n.createdAt)+'</span>'+
        '</div>'+
        (n.preview?'<div class="notif-preview">'+esc(n.preview)+'</div>':'')+
        (link?'<div style="margin-top:4px">'+link+'</div>':'')+
        '</div>';
    }).join('');
  }).catch(function () {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--red);font-family:var(--mono);font-size:11px">加载失败</div>';
  });
};

// Hook renderHeader
var _origRenderHeader = Auth.renderHeader.bind(Auth);
Auth.renderHeader = function () {
  _origRenderHeader();
  setTimeout(function () {
    MobileNav.syncBadge();
    MobileNav.updateMeIcon();
  }, 50);
};

/* ══════════════════════════════════════════════════════════
   IMAGE VIEWER (lightbox)
   ══════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
   IMAGE VIEWER (lightbox)
   ══════════════════════════════════════════════════════════ */
var ImageViewer = {
  _images: [],
  _idx: 0,

  open: function (images, idx) {
    this._images = Array.isArray(images) ? images : [];
    this._idx    = idx || 0;
    var el = document.getElementById('img-viewer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'img-viewer';
      el.innerHTML =
        '<div id="img-viewer-overlay"></div>' +
        '<button id="img-viewer-prev">‹</button>' +
        '<img id="img-viewer-img" alt="">' +
        '<button id="img-viewer-next">›</button>' +
        '<button id="img-viewer-close">✕</button>' +
        '<div id="img-viewer-counter"></div>';
      document.body.appendChild(el);
      document.getElementById('img-viewer-overlay').addEventListener('click', function(){ ImageViewer.close(); });
      document.getElementById('img-viewer-close').addEventListener('click', function(){ ImageViewer.close(); });
      document.getElementById('img-viewer-prev').addEventListener('click', function(){ ImageViewer.prev(); });
      document.getElementById('img-viewer-next').addEventListener('click', function(){ ImageViewer.next(); });
      document.addEventListener('keydown', function(e){
        if (!document.getElementById('img-viewer').classList.contains('active')) return;
        if (e.key === 'ArrowLeft') ImageViewer.prev();
        if (e.key === 'ArrowRight') ImageViewer.next();
        if (e.key === 'Escape') ImageViewer.close();
      });
    }
    el.classList.add('active');
    this._render();
  },

  _render: function () {
    document.getElementById('img-viewer-img').src = this._images[this._idx];
    document.getElementById('img-viewer-counter').textContent = (this._idx + 1) + ' / ' + this._images.length;
    document.getElementById('img-viewer-prev').style.display = this._images.length > 1 ? '' : 'none';
    document.getElementById('img-viewer-next').style.display = this._images.length > 1 ? '' : 'none';
  },

  prev: function () { this._idx = (this._idx - 1 + this._images.length) % this._images.length; this._render(); },
  next: function () { this._idx = (this._idx + 1) % this._images.length; this._render(); },
  close: function () {
    var el = document.getElementById('img-viewer');
    if (el) el.classList.remove('active');
  }
};

// Global click handler for image grids (avoids inline JSON issues)
document.addEventListener('click', function (e) {
  var thumb = e.target.closest('.art-img-thumb');
  if (!thumb) return;
  var grid = thumb.closest('.art-img-grid');
  if (!grid) return;
  var imgs;
  try { imgs = JSON.parse(grid.dataset.imgs || '[]'); } catch(_) { imgs = []; }
  var idx = parseInt(thumb.dataset.idx) || 0;
  if (imgs.length) ImageViewer.open(imgs, idx);
});

// Init
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () { MobileNav.init(); }, 120);
});
