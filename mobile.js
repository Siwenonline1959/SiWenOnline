/**
 * FRONTLINE · mobile.js
 * Standalone mobile controller — only runs on ≤700px screens.
 * Reads from the same State / API / Dialog objects as app.js,
 * but handles its own pages, navigation, and article detail.
 */

/* ════════════════════════════════════════════════════════
   MOBILE CONTROLLER
════════════════════════════════════════════════════════ */
var Mobile = {

  /* ── internal state ── */
  _active: null,          // 'home' | 'following' | 'notif' | 'me'
  _articleId: null,       // currently open article
  _replyParentId: null,
  _replyParentUser: null,

  /* ── is this a mobile viewport? ── */
  isMobile: function () { return window.innerWidth <= 700; },

  /* ── bootstrap ── */
  init: function () {
    if (!Mobile.isMobile()) return;

    Mobile._buildTopBar();
    Mobile._buildNav();
    Mobile._buildArticlePage();
    Mobile._bindSearch();
    Mobile._syncTabs();
    Mobile._setActive('home');

    // Show mobile chrome with intro animations
    var hdr = document.getElementById('mobile-header');
    var nav = document.getElementById('mobile-nav');
    if (hdr) { hdr.style.display = 'flex'; hdr.classList.add('m-hdr-ready'); }
    if (nav) { nav.style.display = 'flex'; nav.classList.add('m-nav-ready'); }

    // Sync feed-col top to actual header height
    Mobile._syncFeedTop();
    // Re-sync if header height changes (e.g. search expand)
    if (hdr) new ResizeObserver(Mobile._syncFeedTop).observe(hdr);

    // Keep tabs in sync when desktop tabs re-render
    var desktopTabs = document.getElementById('tabs-row');
    if (desktopTabs) {
      new MutationObserver(Mobile._syncTabs).observe(desktopTabs, { childList: true });
    }

    // Hook into auth changes to update nav avatar
    var _orig = Auth.renderHeader.bind(Auth);
    Auth.renderHeader = function () {
      _orig();
      setTimeout(function () {
        Mobile._updateMeIcon();
        Mobile._syncBadge();
      }, 60);
    };
  },

  /* ── Build top bar HTML (replaces masthead on mobile) ── */
  _buildTopBar: function () {
    var hdr = document.getElementById('mobile-header');
    if (!hdr) return;
    hdr.innerHTML =
      '<div id="m-search-row">' +
        '<div id="m-search-box">' +
          '<span id="m-search-icon">⌕</span>' +
          '<input id="m-search-input" type="search" placeholder="搜索战报…" autocomplete="off" />' +
        '</div>' +
        '<button id="m-search-cancel">取消</button>' +
      '</div>' +
      '<div id="m-tabs-row"></div>';
  },

  /* ── Build bottom nav ── */
  _buildNav: function () {
    var nav = document.getElementById('mobile-nav');
    if (!nav) return;
    // All icons are 22×22 SVG (Feather-style, stroke-based) for pixel-perfect consistency
    var ico = {
      home:      '<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>',
      following: '<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 11l2 2 4-4"/></svg>',
      notif:     '<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
      me:        '<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>'
    };
    nav.innerHTML =
      '<button class="mnav-btn m-active" id="mnav-home" onclick="Mobile.go(\'home\')">' +
        '<span class="mnav-icon">' + ico.home + '</span>' +
        '<span class="mnav-dot"></span>' +
        '<span class="mnav-label">首页</span>' +
      '</button>' +
      '<button class="mnav-btn" id="mnav-following" onclick="Mobile.go(\'following\')">' +
        '<span class="mnav-icon">' + ico.following + '</span>' +
        '<span class="mnav-dot"></span>' +
        '<span class="mnav-label">关注</span>' +
      '</button>' +
      '<button class="mnav-btn mnav-pub" onclick="Mobile.publish()">' +
        '<div class="mnav-pub-pill">+</div>' +
      '</button>' +
      '<button class="mnav-btn" id="mnav-notif" onclick="Mobile.go(\'notif\')">' +
        '<span class="mnav-icon">' + ico.notif + '</span>' +
        '<span class="mnav-dot"></span>' +
        '<span class="mnav-label">通知</span>' +
        '<span class="mnav-badge" id="mnav-badge" hidden></span>' +
      '</button>' +
      '<button class="mnav-btn" id="mnav-me" onclick="Mobile.go(\'me\')">' +
        '<span class="mnav-icon" id="mnav-me-icon">' + ico.me + '</span>' +
        '<span class="mnav-dot"></span>' +
        '<span class="mnav-label">我的</span>' +
      '</button>';
  },

  /* ── Article page already exists in HTML, just bind textarea ── */
  _buildArticlePage: function () {
    var ta  = document.getElementById('m-comment-ta');
    var bar = document.getElementById('m-comment-bar');
    if (!ta || ta._bound) return;
    ta._bound = true;

    /* Focus / blur: active styling only */
    ta.addEventListener('focus', function () {
      if (bar) bar.classList.add('bar-active');
    });
    ta.addEventListener('blur', function () {
      if (bar) bar.classList.remove('bar-active');
    });

    /* Auto-resize textarea upward — bar grows, never shrinks below min-height */
    ta.addEventListener('input', function () {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
      Mobile._syncBodyPad();
    });

    /* ── visualViewport: move bar up with transform when keyboard opens ──
       Bar is fixed height. We shift it up by exactly the keyboard height
       using translateY so it sits flush above the keyboard.
       transform is GPU-composited — no layout thrash, no scroll jank.    */
    if (window.visualViewport) {
      function onViewport() {
        var vv = window.visualViewport;
        var kbHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        if (bar) bar.style.transform = 'translateY(-' + kbHeight + 'px)';
        Mobile._syncBodyPad();
      }
      window.visualViewport.addEventListener('resize', onViewport);
      window.visualViewport.addEventListener('scroll', onViewport);
      Mobile._vvCleanup = function () {
        window.visualViewport.removeEventListener('resize', onViewport);
        window.visualViewport.removeEventListener('scroll', onViewport);
        if (bar) bar.style.transform = 'translateY(0)';
      };
    }
  },

  /* ── Keep article body from being hidden under the bar ── */
  _syncFeedTop: function () {
    var hdr = document.getElementById('mobile-header');
    var feedCol = document.getElementById('feed-col');
    if (!hdr || !feedCol) return;
    feedCol.style.top = hdr.offsetHeight + 'px';
  },

  _syncBodyPad: function () {
    var bar  = document.getElementById('m-comment-bar');
    var body = document.getElementById('m-article-body');
    if (!bar || !body) return;
    /* bar.offsetHeight is always the fixed nav height.
       Add the keyboard offset (from transform) so content scrolls above both. */
    var kbOffset = Math.abs(parseFloat(
      (bar.style.transform || '').replace('translateY(', '').replace('px)', '')) || 0);
    body.style.paddingBottom = (bar.offsetHeight + kbOffset + 8) + 'px';
  },

  /* ── Sync tabs from desktop tabs-row into mobile #m-tabs-row ── */
  _syncTabs: function () {
    var mRow = document.getElementById('m-tabs-row');
    var dRow = document.getElementById('tabs-row');
    if (!mRow || !dRow) return;
    mRow.innerHTML = '';
    dRow.querySelectorAll('.tab-btn').forEach(function (btn) {
      var tab = btn.dataset.tab || btn.textContent.replace(/\d+/g, '').trim();
      var isFeed = btn.dataset.feed === 'following';
      // Skip 关注 tab — it has its own bottom nav page
      if (isFeed) return;
      var clone = document.createElement('button');
      clone.className = 'tab-btn m-tab' + (btn.classList.contains('active') ? ' active' : '');
      clone.textContent = btn.textContent;
      clone.addEventListener('click', function () {
        // Close any open page, go back to feed
        Mobile._showPage(null);
        Mobile._setActive('home');
        App.switchTab(tab);
        // Sync active on mobile tabs
        mRow.querySelectorAll('.m-tab').forEach(function (b) { b.classList.remove('active'); });
        clone.classList.add('active');
        // Clear search
        var inp = document.getElementById('m-search-input');
        if (inp) inp.value = '';
        var hdr = document.getElementById('mobile-header');
        if (hdr) hdr.classList.remove('m-searching');
      });
      mRow.appendChild(clone);
    });
  },

  /* ── Search bindings ── */
  _bindSearch: function () {
    var inp = document.getElementById('m-search-input');
    var cancel = document.getElementById('m-search-cancel');
    var hdr = document.getElementById('mobile-header');
    if (!inp) return;
    var timer = null;
    inp.addEventListener('focus', function () { hdr && hdr.classList.add('m-searching'); });
    inp.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        State.searchQuery = inp.value.trim();
        Mobile._showPage(null);
        Mobile._setActive('home');
        App.loadFeed ? App.loadFeed() : App.renderFeed();
      }, 350);
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        clearTimeout(timer);
        State.searchQuery = inp.value.trim();
        Mobile._showPage(null);
        Mobile._setActive('home');
        App.loadFeed ? App.loadFeed() : App.renderFeed();
        inp.blur();
      }
    });
    if (cancel) {
      cancel.addEventListener('click', function () {
        inp.value = '';
        State.searchQuery = '';
        hdr && hdr.classList.remove('m-searching');
        inp.blur();
        App.loadFeed ? App.loadFeed() : App.renderFeed();
      });
    }
  },

  /* ── Show/hide full-screen pages (关注/通知/我的) ── */
  _showPage: function (pageId) {
    ['m-page-following', 'm-page-notif', 'm-page-me'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id === pageId) {
        el.style.display = 'flex';
        el.style.pointerEvents = '';
        el.classList.remove('m-page-open');
        void el.offsetWidth;
        el.classList.add('m-page-open');
      } else {
        if (el.classList.contains('m-page-open')) {
          el.style.pointerEvents = 'none';
          el.classList.add('m-page-exit');
          el.classList.remove('m-page-open');
          setTimeout(function () {
            el.style.display = 'none';
            el.style.pointerEvents = '';
            el.classList.remove('m-page-exit');
          }, 180);
        } else {
          el.style.display = 'none';
          el.style.pointerEvents = '';
        }
      }
    });
    // Show/hide feed + topbar
    var feed = document.getElementById('layout');
    var hdr  = document.getElementById('mobile-header');
    var show = !pageId;
    if (feed) feed.style.display = show ? '' : 'none';
    if (hdr)  hdr.style.display  = show ? 'flex' : 'none';
    document.body.style.overflow = show ? '' : 'hidden';
  },

  /* ── Set active nav button ── */
  _setActive: function (tab) {
    ['home', 'following', 'notif', 'me'].forEach(function (t) {
      var el = document.getElementById('mnav-' + t);
      if (!el) return;
      var wasActive = el.classList.contains('m-active');
      el.classList.toggle('m-active', t === tab);
      // Bounce the icon when newly activated
      if (t === tab && !wasActive) {
        var ico = el.querySelector('.mnav-icon');
        if (ico) {
          ico.classList.remove('mnav-bounce');
          void ico.offsetWidth;
          ico.classList.add('mnav-bounce');
        }
      }
    });
    Mobile._active = tab;
  },

  /* ── Update me icon ── */
  _updateMeIcon: function () {
    var icon = document.getElementById('mnav-me-icon');
    if (!icon) return;
    if (State.currentUser) {
      // Replace SVG with avatar initial
      icon.innerHTML = '<span style="font-size:14px;font-weight:700;color:var(--text-bright)">' + State.currentUser.username[0].toUpperCase() + '</span>';
      icon.style.cssText = 'background:var(--olive);border:2px solid var(--olive-light);border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center';
    } else {
      icon.innerHTML = '<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;stroke:currentColor;fill:none"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
      icon.style.cssText = '';
    }
    // Refresh me page if open
    if (Mobile._active === 'me') Mobile._loadMePage();
  },

  /* ── Sync notification badge ── */
  _syncBadge: function () {
    var hBadge = document.getElementById('notif-badge');
    var mBadge = document.getElementById('mnav-badge');
    if (!mBadge) return;
    if (hBadge && !hBadge.hidden && hBadge.textContent) {
      mBadge.textContent = hBadge.textContent;
      mBadge.removeAttribute('hidden');
    } else {
      mBadge.setAttribute('hidden', '');
    }
  },

  /* ═══════════════════════════════════════════════════════
     NAVIGATION
  ═══════════════════════════════════════════════════════ */
  go: function (tab) {
    if (!Mobile.isMobile()) return;

    // Close article if open
    if (document.getElementById('m-article-page') &&
        document.getElementById('m-article-page').classList.contains('m-page-open')) {
      Mobile.closeArticle();
    }

    Mobile._setActive(tab);

    if (tab === 'home') {
      Mobile._showPage(null);

    } else if (tab === 'following') {
      Mobile._showPage('m-page-following');
      Mobile._loadFollowingPage();

    } else if (tab === 'notif') {
      Mobile._showPage('m-page-notif');
      Mobile._loadNotifPage();
      var mBadge = document.getElementById('mnav-badge');
      if (mBadge) mBadge.setAttribute('hidden', '');

    } else if (tab === 'me') {
      if (!State.currentUser) {
        Dialog.open('dlg-login');
        Mobile._setActive('home');
        return;
      }
      Mobile._showPage('m-page-me');
      Mobile._loadMePage();
    }
  },

  publish: function () {
    if (!State.currentUser) { Toast.show('请先登录', true); Dialog.open('dlg-login'); return; }
    if (State.currentUser.isAdmin) { Admin.open(); }
    else { Admin.openPublishOnly(); }
  },

  /* ═══════════════════════════════════════════════════════
     PAGE LOADERS — ensure the page divs exist before loading
  ═══════════════════════════════════════════════════════ */
  _ensurePage: function (id, title, actionHtml, bodyId) {
    var existing = document.getElementById(id);
    if (existing) return existing.querySelector('#' + bodyId);
    var page = document.createElement('div');
    page.id = id; page.className = 'm-page'; page.style.display = 'none';
    page.innerHTML =
      '<div class="m-page-hd">' +
        '<span class="m-page-title">' + title + '</span>' +
        (actionHtml || '') +
      '</div>' +
      '<div class="m-page-body" id="' + bodyId + '"></div>';
    document.body.appendChild(page);
    return page.querySelector('#' + bodyId);
  },

  /* ── 关注 page ── */
  _loadFollowingPage: function () {
    var body = document.getElementById('m-following-body');
    if (!body) return;
    if (!State.currentUser) {
      body.innerHTML = '<div class="m-login-prompt"><p>登录后查看关注动态</p><button class="btn-primary" onclick="Dialog.open(\'dlg-login\')">立即登录</button></div>';
      return;
    }
    body.innerHTML = '<div class="m-empty">加载中…</div>';
    API.getArticles({ feed: 'following', userId: State.currentUser.id }).then(function (arts) {
      if (!arts || !arts.length) {
        body.innerHTML = '<div class="m-empty">还没有关注任何人，去发现有趣的用户吧</div>';
        return;
      }
      body.innerHTML = arts.map(function (a) { return Mobile._cardHTML(a); }).join('');
      Mobile._staggerCards(body);
      // Bind card clicks (same guard as _bindFeedCards - skip buttons/links)
      body.querySelectorAll('.m-card[data-id]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          if (e.target.closest('[data-action]')) return;
          if (e.target.closest('button, a')) return;
          Mobile.openArticle(el.dataset.id);
        });
      });
    }).catch(function () {
      body.innerHTML = '<div class="m-empty">加载失败，请稍后重试</div>';
    });
  },

  _loadNotifPage: function () {
    var body = document.getElementById('m-notif-body');
    if (!body) return;

    var readAll = document.getElementById('m-notif-readall');
    if (readAll) {
      readAll.onclick = function () {
        if (!State.currentUser) { Toast.show('请先登录', true); return; }
        readAll.textContent = '处理中'; readAll.disabled = true;
        var uid = State.currentUser.id;
        var p = API.markAllRead ? API.markAllRead() : Promise.resolve();
        p.then(function () {
          readAll.textContent = '全部已读'; readAll.disabled = false;
          var mBadge = document.getElementById('mnav-badge');
          if (mBadge) mBadge.setAttribute('hidden', '');
          body.querySelectorAll('.m-notif.unread').forEach(function (el) {
            el.classList.remove('unread');
          });
          Toast.show('已全部标为已读 ✓');
        }).catch(function () { readAll.textContent = '全部已读'; readAll.disabled = false; });
      };
    }

    if (!State.currentUser) {
      body.innerHTML = '<div class="m-login-prompt"><p>登录后查看通知</p><button class="btn-primary" onclick="Dialog.open(\'dlg-login\')">立即登录</button></div>';
      return;
    }
    body.innerHTML = '<div class="m-empty">加载中…</div>';
    API.getNotifications(State.currentUser.id).then(function (notifs) {
      var mBadge = document.getElementById('mnav-badge');
      if (mBadge) mBadge.setAttribute('hidden', '');
      if (!notifs || !notifs.length) {
        body.innerHTML = '<div class="m-empty">// 暂无通知</div>';
        return;
      }
      var typeLabel = {
        follow: '关注了你', comment: '评论了你的文章',
        reply: '回复了你的评论', like: '点赞了你的文章',
        like_article: '点赞了你的文章', like_comment: '点赞了你的评论',
        save: '收藏了你的文章', comment_like: '点赞了你的评论'
      };
      body.innerHTML = notifs.map(function (n) {
        var label = typeLabel[n.type] || n.type;
        var link = n.articleId
          ? '<button class="m-notif-link" data-aid="' + n.articleId + '" data-cmt="' + (n.commentId || '') + '">查看 →</button>'
          : '';
        return '<div class="m-notif' + (n.isRead ? '' : ' unread') + '">' +
          '<div class="m-notif-top">' +
          '<span class="m-notif-actor" data-uid="' + n.actorId + '">' + esc(n.actorName) + '</span>' +
          '<span class="m-notif-verb">' + label + '</span>' +
          '<span class="m-notif-time">' + formatDate(n.createdAt || n.date) + '</span>' +
          '</div>' +
          (n.preview ? '<div class="m-notif-preview">' + esc(n.preview) + '</div>' : '') +
          (link ? '<div style="margin-top:4px">' + link + '</div>' : '') +
          '</div>';
      }).join('');
      Mobile._staggerCards(body);
      // Mark all as read after rendering
      setTimeout(function () {
        if (API.markAllRead) {
          API.markAllRead().then(function () {
            body.querySelectorAll('.m-notif.unread').forEach(function (el) {
              el.classList.remove('unread');
            });
            var mBadge2 = document.getElementById('mnav-badge');
            if (mBadge2) mBadge2.setAttribute('hidden', '');
          }).catch(function(){});
        }
      }, 400);
      // Bind clicks
      body.querySelectorAll('.m-notif-actor').forEach(function (el) {
        el.addEventListener('click', function () { Profile.open(el.dataset.uid); });
      });
      body.querySelectorAll('.m-notif-link').forEach(function (el) {
        el.addEventListener('click', function () {
          Mobile.openArticle(el.dataset.aid, !!el.dataset.cmt);
        });
      });
    }).catch(function () {
      body.innerHTML = '<div class="m-empty">加载失败</div>';
    });
  },

  /* ── 我的 page ── */
  _loadMePage: function () {
    var page = document.getElementById('m-page-me');
    if (!page) return;

    // Bind tabs once
    if (!page._tabsBound) {
      page._tabsBound = true;
      page.querySelectorAll('.m-me-tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
          page.querySelectorAll('.m-me-tab').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          Mobile._loadMeTab(btn.dataset.tab);
        });
      });
      // Bind logout
      var logoutBtn = document.getElementById('m-logout-btn');
      if (logoutBtn) {
        logoutBtn.onclick = function () { Auth.doLogout(); Mobile.go('home'); };
      }
      // (notif read-all bound in _loadNotifPage)
    }

    var logoutBtn = document.getElementById('m-logout-btn');
    if (!State.currentUser) {
      var header = document.getElementById('m-me-header');
      if (header) header.innerHTML = '<div class="m-login-prompt"><p>登录后查看个人主页</p><button class="btn-primary" onclick="Dialog.open(\'dlg-login\')">立即登录</button></div>';
      if (logoutBtn) logoutBtn.style.display = 'none';
      return;
    }

    if (logoutBtn) logoutBtn.style.display = '';
    var u = State.currentUser;

    API.getFollowStats(u.id).then(function (stats) {
      var header = document.getElementById('m-me-header');
      if (!header) return;
      header.innerHTML =
        '<div class="m-avatar">' + u.username[0].toUpperCase() + '</div>' +
        '<div>' +
          '<div class="m-user-name">' + esc(u.username) + '</div>' +
          '<div class="m-user-sub">' + esc(u.email) + (u.isAdmin ? ' · 管理员' : '') + '</div>' +
          '<div class="m-user-stats">' +
            '<span class="m-user-stat"><strong>' + (stats.followers || 0) + '</strong> 粉丝</span>' +
            '<span class="m-user-stat"><strong>' + (stats.following || 0) + '</strong> 关注</span>' +
          '</div>' +
        '</div>';
    }).catch(function () {
      var header = document.getElementById('m-me-header');
      if (header) header.innerHTML =
        '<div class="m-avatar">' + u.username[0].toUpperCase() + '</div>' +
        '<div><div class="m-user-name">' + esc(u.username) + '</div></div>';
    });

    // Reset to articles tab
    page.querySelectorAll('.m-me-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === 'articles');
    });
    Mobile._loadMeTab('articles');
  },

  _loadMeTab: function (tab) {
    var body = document.getElementById('m-me-body');
    if (!body || !State.currentUser) return;
    body.innerHTML = '<div class="m-empty">加载中…</div>';

    if (tab === 'articles') {
      API.getProfileArticles(State.currentUser.id).then(function (arts) {
        if (!arts || !arts.length) { body.innerHTML = '<div class="m-empty">暂无发布内容</div>'; return; }
        body.innerHTML = arts.map(function (a) {
          return '<div class="m-item" data-id="' + a.id + '">' +
            '<span class="m-item-emoji">' + (a.emoji || '📰') + '</span>' +
            '<div class="m-item-body">' +
              '<div class="m-item-title">' + esc(a.title) + '</div>' +
              '<div class="m-item-sub">' + esc(a.source) + ' · ' + formatDate(a.date) + ' · ♥ ' + a.likes + '</div>' +
              (a.desc ? '<div class="m-item-preview">' + esc(a.desc) + '</div>' : '') +
            '</div>' +
            '<button class="m-item-del" data-id="' + a.id + '">删除</button>' +
          '</div>';
        }).join('');
        body.querySelectorAll('.m-item').forEach(function (el) {
          el.addEventListener('click', function (e) {
            if (e.target.classList.contains('m-item-del')) return;
            Mobile.openArticle(el.dataset.id);
          });
        });
        body.querySelectorAll('.m-item-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!confirm('确认删除这篇文章？')) return;
            API.deleteArticle(btn.dataset.id).then(function () {
              btn.closest('.m-item').remove();
              App.renderFeed(); Toast.show('文章已删除');
            }).catch(function () { Toast.show('删除失败', true); });
          });
        });
      }).catch(function () { body.innerHTML = '<div class="m-empty">加载失败</div>'; });

    } else if (tab === 'comments') {
      API.getProfileComments(State.currentUser.id).then(function (cmts) {
        if (!cmts || !cmts.length) { body.innerHTML = '<div class="m-empty">暂无评论记录</div>'; return; }
        body.innerHTML = cmts.map(function (c) {
          return '<div class="m-item" data-aid="' + c.articleId + '" data-id="' + c.id + '">' +
            '<span class="m-item-emoji">💬</span>' +
            '<div class="m-item-body">' +
              '<div class="m-item-sub">' + (c.parentId ? '回复 @' + esc(c.parentUsername || '') : '评论了《' + esc(c.articleTitle) + '》') + '</div>' +
              '<div class="m-item-preview">' + esc(c.text) + '</div>' +
              '<div class="m-item-sub" style="margin-top:4px">' + formatDate(c.date) + '</div>' +
            '</div>' +
            '<button class="m-item-del" data-id="' + c.id + '" data-aid="' + c.articleId + '">删除</button>' +
          '</div>';
        }).join('');
        body.querySelectorAll('.m-item').forEach(function (el) {
          el.addEventListener('click', function (e) {
            if (e.target.classList.contains('m-item-del')) return;
            Mobile.openArticle(el.dataset.aid);
          });
        });
        body.querySelectorAll('.m-item-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!confirm('确认删除这条评论？')) return;
            var aid = btn.dataset.aid, cid = btn.dataset.id;
            fetch((typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'https://api.kalyna.homes') +
              '/articles/' + aid + '/comments/' + cid, {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + (window._fl_token || '') }
            }).then(function (r) {
              if (!r.ok) throw new Error();
              btn.closest('.m-item').remove();
              Toast.show('评论已删除');
            }).catch(function () { Toast.show('删除失败', true); });
          });
        });
      }).catch(function () { body.innerHTML = '<div class="m-empty">加载失败</div>'; });

    } else if (tab === 'saved') {
      API.getUserSaves(State.currentUser.id).then(function (ids) {
        if (!ids || !ids.length) { body.innerHTML = '<div class="m-empty">暂无收藏</div>'; return; }
        return API.getArticles({}).then(function (arts) {
          var saved = ids.map(function (id) {
            return (arts || []).find(function (a) { return a.id === id; });
          }).filter(Boolean);
          if (!saved.length) { body.innerHTML = '<div class="m-empty">暂无收藏</div>'; return; }
          body.innerHTML = saved.map(function (a) {
            return '<div class="m-item" data-id="' + a.id + '">' +
              '<span class="m-item-emoji">' + (a.emoji || '📰') + '</span>' +
              '<div class="m-item-body">' +
                '<div class="m-item-title">' + esc(a.title) + '</div>' +
                '<div class="m-item-sub">' + esc(a.source) + '</div>' +
                (a.desc ? '<div class="m-item-preview">' + esc(a.desc) + '</div>' : '') +
              '</div>' +
              '<button class="m-item-del" data-id="' + a.id + '">取消</button>' +
            '</div>';
          }).join('');
          body.querySelectorAll('.m-item').forEach(function (el) {
            el.addEventListener('click', function (e) {
              if (e.target.classList.contains('m-item-del')) return;
              Mobile.openArticle(el.dataset.id);
            });
          });
          body.querySelectorAll('.m-item-del').forEach(function (btn) {
            btn.addEventListener('click', function () {
              API.toggleSave(btn.dataset.id).then(function () {
                btn.closest('.m-item').remove();
                App.renderFeed(); Toast.show('已取消收藏');
              }).catch(function () { Toast.show('操作失败', true); });
            });
          });
        });
      }).catch(function () { body.innerHTML = '<div class="m-empty">加载失败</div>'; });
    }
  },

  /* ── Mini card HTML for following feed ── */
  _cardHTML: function (a) {
    var liked = State.userLikes.indexOf(a.id) >= 0;
    var saved = State.userSaves.indexOf(a.id) >= 0;
    var tags = '';
    if (a.alertLevel) tags += '<span class="tag tag-alert-' + a.alertLevel + '">' + a.alertLevel + '</span>';
    if (a.featured)   tags += '<span class="tag tag-featured">★ FEATURED</span>';
    return '<div class="news-card m-card" data-id="' + a.id + '">' +
      '<div class="card-body">' +
        (tags ? '<div class="card-tags">' + tags + '</div>' : '') +
        '<div class="card-title">' + esc(a.title) + '</div>' +
        (a.desc ? '<div class="card-desc">' + esc(a.desc) + '</div>' : '') +
        (a.images&&a.images.length ? '<div class="art-img-grid art-img-grid--'+Math.min(a.images.length,3)+'">'+a.images.map(function(u,i){return '<img src="'+esc(u)+'" alt="" loading="lazy" data-idx="'+i+'" class="art-img-thumb">';}).join('')+'</div>' : '') +
        '<div class="card-meta"><span class="card-src">' + esc(a.source) + '</span><span class="card-time">' + formatDate(a.date) + '</span></div>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button class="act-btn' + (liked ? ' is-liked' : '') + '" data-action="like" data-id="' + a.id + '">♥ <span>' + a.likes + '</span></button>' +
        '<button class="act-btn' + (saved ? ' is-saved' : '') + '" data-action="save" data-id="' + a.id + '">◈ <span>' + (a.saves || 0) + '</span></button>' +
        '<button class="act-btn-read" data-action="open" data-id="' + a.id + '">阅读 &rsaquo;</button>' +
      '</div>' +
    '</div>';
  },

  /* ═══════════════════════════════════════════════════════
     ARTICLE DETAIL PAGE
  ═══════════════════════════════════════════════════════ */
  openArticle: function (id, focusComment) {
    Mobile._articleId = id;
    Mobile._replyParentId = null;
    Mobile._replyParentUser = null;

    var page = document.getElementById('m-article-page');
    var body = document.getElementById('m-article-body');
    if (!page || !body) return;

    body.innerHTML = '<div class="m-empty">加载中…</div>';
    page.style.display = 'flex';
    page.classList.remove('m-page-open', 'm-art-slide-in');
    void page.offsetWidth; // force reflow
    page.classList.add('m-page-open', 'm-art-slide-in');
    // Hide top bar and nav while article is open
    var hdr2 = document.getElementById('mobile-header');
    var nav2 = document.getElementById('mobile-nav');
    if (hdr2) hdr2.style.display = 'none';
    if (nav2) nav2.style.display = 'none';
    // Hide layout too
    var layout2 = document.getElementById('layout');
    if (layout2) layout2.style.display = 'none';
    document.body.style.overflow = 'hidden';
    var bar = document.getElementById('m-comment-bar');
    if (bar) {
      bar.style.display = State.currentUser ? 'flex' : 'none';
      bar.style.bottom = '0px';
      bar.classList.remove('bar-active');
    }

    API.getArticle(id).then(function (a) {
      API.recordView && API.recordView(id);
      Mobile._renderArticle(a);
      if (focusComment) {
        setTimeout(function () {
          var ta = document.getElementById('m-comment-ta');
          if (ta) ta.focus();
        }, 200);
      }
    }).catch(function () {
      body.innerHTML = '<div class="m-empty">加载失败</div>';
    });
  },

  _renderArticle: function (a) {
    var liked = State.userLikes.indexOf(a.id) >= 0;
    var saved = State.userSaves.indexOf(a.id) >= 0;
    var label = document.getElementById('m-article-label');
    if (label) label.textContent = '// ' + a.source + ' · ' + (a.category || '');

    var tags = '';
    if (a.alertLevel) tags += '<span class="tag tag-alert-' + a.alertLevel + '">' + a.alertLevel + '</span>';
    if (a.featured)   tags += '<span class="tag tag-featured">★ FEATURED</span>';

    var body = document.getElementById('m-article-body');
    body.style.opacity = '0';
    body.innerHTML =
      (tags ? '<div class="m-art-tags">' + tags + '</div>' : '') +
      '<div class="m-art-title">' + esc(a.title) + '</div>' +
      (a.desc ? '<div class="m-art-desc">' + esc(a.desc) + '</div>' : '') +
      (a.images&&a.images.length ? '<div class="art-img-grid art-img-grid--'+Math.min(a.images.length,3)+'">'+a.images.map(function(u,i){return '<img src="'+esc(u)+'" alt="" loading="lazy" data-idx="'+i+'" class="art-img-thumb">';}).join('')+'</div>' : '') +
      '<div class="m-art-meta">' +
        '<span>' + esc(a.source) + '</span>' +
        '<span>' + formatDate(a.date) + '</span>' +
        (a.authorId ? '<span class="m-art-author" data-uid="' + a.authorId + '">' + esc(a.authorName || '匿名') + '</span>' : '') +
      '</div>' +
      '<div class="m-art-actions">' +
        '<a class="m-art-read" href="' + (a.url || '#') + '" target="_blank" rel="noopener">阅读原文</a>' +
        '<button class="m-act' + (liked ? ' liked' : '') + '" id="m-like-btn" data-id="' + a.id + '">♥ <span>' + a.likes + '</span></button>' +
        '<button class="m-act' + (saved ? ' saved' : '') + '" id="m-save-btn" data-id="' + a.id + '">◈ <span>' + (a.saves || 0) + '</span></button>' +
      '</div>' +
      '<div class="m-comments-head">// 评论 · ' + ((a.comments || []).length) + ' 条</div>' +
      '<div id="m-comment-list">' + Mobile._renderComments(a.comments || [], a.id) + '</div>';

    // Bind like/save
    var likeBtn = document.getElementById('m-like-btn');
    var saveBtn = document.getElementById('m-save-btn');
    if (likeBtn) likeBtn.addEventListener('click', function () { Mobile._toggleLike(a.id, likeBtn); });
    if (saveBtn) saveBtn.addEventListener('click', function () { Mobile._toggleSave(a.id, saveBtn); });

    // Bind author
    body.querySelectorAll('.m-art-author').forEach(function (el) {
      el.addEventListener('click', function () { Profile.open(el.dataset.uid); });
    });

    // Bind comment likes & reply buttons
    Mobile._bindCommentActions(body, a.id);

    // Fade in content
    requestAnimationFrame(function () {
      body.style.transition = 'opacity 0.22s ease';
      body.style.opacity = '1';
    });

    // Reset comment bar
    var ta = document.getElementById('m-comment-ta');
    if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    Mobile._cancelReply();
  },

  _renderComments: function (comments, articleId) {
    if (!comments || !comments.length) return '<div class="m-empty">暂无评论</div>';
    return comments.map(function (c) {
      
      var replyPrefix = c.parentId && c.parentUsername
        ? '<div class="m-cmt-prefix">回复 @' + esc(c.parentUsername) + '</div>' : '';
      var replyBtn = State.currentUser
        ? '<button class="m-cmt-reply-btn" data-uid="' + c.userId + '" data-id="' + c.id + '" data-user="' + esc(c.user) + '">回复</button>' : '';
      var likedCmt = c.liked ? ' liked' : '';
      return '<div class="m-cmt' + (c.parentId ? ' is-reply' : '') + '" id="m-cmt-' + c.id + '">' +
        '<div class="m-cmt-meta">' +
          '<span class="m-cmt-user" data-uid="' + c.userId + '">@' + esc(c.user) + '</span>' +
          '<span class="m-cmt-time">' + formatDate(c.date) + '</span>' +
          replyBtn +
          '<button class="m-cmt-like' + likedCmt + '" data-id="' + c.id + '" data-aid="' + articleId + '">♥ <span>' + (c.likes || 0) + '</span></button>' +
        '</div>' +
        replyPrefix +
        '<div class="m-cmt-body">' + esc(c.text) + '</div>' +
        (c.replies && c.replies.length ? Mobile._renderComments(c.replies, articleId) : '') +
      '</div>';
    }).join('');
  },

  _bindCommentActions: function (root, articleId) {
    root.querySelectorAll('.m-cmt-user').forEach(function (el) {
      el.addEventListener('click', function () { Profile.open(el.dataset.uid); });
    });
    root.querySelectorAll('.m-cmt-reply-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Mobile._replyParentId = btn.dataset.id;
        Mobile._replyParentUser = btn.dataset.user;
        var banner = document.getElementById('m-reply-banner');
        var label  = document.getElementById('m-reply-label');
        if (banner) { banner.style.display = 'flex'; banner.classList.add('active'); }
        if (label)  label.textContent = '回复 @' + btn.dataset.user;
        setTimeout(Mobile._syncBodyPad, 50);
        var ta = document.getElementById('m-comment-ta');
        if (ta) { ta.focus(); ta.placeholder = '回复 @' + btn.dataset.user + '…'; }
      });
    });
    root.querySelectorAll('.m-cmt-like').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!State.currentUser) { Toast.show('请先登录', true); return; }
        var cid = btn.dataset.id;
        var aid = btn.dataset.aid || articleId;
        var span = btn.querySelector('span');
        var curLiked = btn.classList.contains('liked');
        // Optimistic update
        var curCount = parseInt(span ? span.textContent : btn.textContent.replace(/\D/g,'')) || 0;
        btn.classList.toggle('liked', !curLiked);
        if (span) span.textContent = curLiked ? Math.max(0, curCount-1) : curCount+1;
        API.toggleCommentLike ? API.toggleCommentLike(aid, cid).then(function(r){
          btn.classList.toggle('liked', r.liked);
          if (span) span.textContent = r.likes !== undefined ? r.likes : (r.liked ? curCount+1 : Math.max(0,curCount-1));
        }).catch(function(){
          // revert
          btn.classList.toggle('liked', curLiked);
          if (span) span.textContent = curCount;
        }) : Interactions.likeComment(aid, cid, btn);
      });
    });
  },

  /* ── Stagger animate a container's direct children ── */
  _staggerCards: function (container) {
    var items = container.querySelectorAll('.news-card, .m-item, .m-notif, .m-cmt');
    items.forEach(function (el, i) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'none';
      setTimeout(function () {
        el.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, i * 35);
    });
  },

  _cancelReply: function () {
    Mobile._replyParentId = null;
    Mobile._replyParentUser = null;
    var banner = document.getElementById('m-reply-banner');
    var ta = document.getElementById('m-comment-ta');
    if (banner) { banner.style.display = 'none'; banner.classList.remove('active'); }
    if (ta) { ta.placeholder = '发表评论…'; }
    setTimeout(Mobile._syncBodyPad, 50);
  },

  sendComment: function () {
    if (!State.currentUser) { Toast.show('请先登录', true); return; }
    var sendBtn = document.getElementById('m-comment-send');
    if (sendBtn) { sendBtn.classList.add('m-btn-pop'); setTimeout(function(){ sendBtn.classList.remove('m-btn-pop'); }, 350); }
    var ta = document.getElementById('m-comment-ta');
    var text = ta ? ta.value.trim() : '';
    if (!text) { Toast.show('评论不能为空', true); return; }
    var id = Mobile._articleId;
    var parentId = Mobile._replyParentId;
    API.postComment(id, State.currentUser.id, State.currentUser.username, text, parentId)
      .then(function () {
        if (ta) { ta.value = ''; ta.style.height = 'auto'; }
        Mobile._cancelReply();
        Mobile._syncBodyPad();
        return API.getArticle(id);
      })
      .then(function (a) {
        Mobile._renderArticle(a);
        App.renderFeed && App.renderFeed();
        Toast.show('评论已发布 ▶');
        Notifications.pollUnread && Notifications.pollUnread();
      })
      .catch(function (e) { Toast.show('发布失败：' + (e.message || ''), true); });
  },

  closeArticle: function () {
    var page = document.getElementById('m-article-page');
    if (!page) return;
    Mobile._articleId = null;
    Mobile._cancelReply();
    // Cleanup keyboard listener
    if (Mobile._vvCleanup) { Mobile._vvCleanup(); Mobile._vvCleanup = null; }
    // Reset bar
    var bar = document.getElementById('m-comment-bar');
    if (bar) { bar.style.transform = 'translateY(0)'; bar.classList.remove('bar-active'); }
    // Reset body padding
    var artBody = document.getElementById('m-article-body');
    if (artBody) artBody.style.paddingBottom = '';
    // Restore chrome immediately so it appears during slide-out
    var nav2 = document.getElementById('mobile-nav');
    document.body.style.overflow = '';
    if (nav2) nav2.style.display = 'flex';
    if (Mobile._active === 'home') {
      var hdr2 = document.getElementById('mobile-header');
      var layout2 = document.getElementById('layout');
      if (hdr2) hdr2.style.display = 'flex';
      if (layout2) layout2.style.display = '';
    } else {
      var pageEl = document.getElementById('m-page-' + Mobile._active);
      if (pageEl) pageEl.style.display = 'flex';
    }
    // Slide page out to the right, then hide
    page.classList.remove('m-art-slide-in');
    page.classList.add('m-art-slide-out');
    setTimeout(function () {
      page.style.display = 'none';
      page.classList.remove('m-page-open', 'm-art-slide-out');
    }, 240);
  },

  /* ── Like / Save helpers ── */
  _toggleLike: function (id, btn) {
    if (!State.currentUser) { Toast.show('请先登录', true); return; }
    var span = btn.querySelector('span');
    var curCount = parseInt(span ? span.textContent : '0') || 0;
    var wasLiked = btn.classList.contains('liked');
    // Tactile pop
    btn.classList.add('m-btn-pop');
    setTimeout(function () { btn.classList.remove('m-btn-pop'); }, 350);
    // Optimistic update
    btn.classList.toggle('liked', !wasLiked);
    if (span) span.textContent = wasLiked ? Math.max(0, curCount-1) : curCount+1;
    API.toggleLike(id).then(function (r) {
      var liked = r.liked !== undefined ? r.liked : !wasLiked;
      var count = r.likes !== undefined ? r.likes : (liked ? curCount+1 : Math.max(0,curCount-1));
      btn.classList.toggle('liked', liked);
      if (span) span.textContent = count;
      if (liked) { if (State.userLikes.indexOf(id)<0) State.userLikes.push(id); }
      else State.userLikes = State.userLikes.filter(function (x) { return x !== id; });
      document.querySelectorAll('[data-action="like"][data-id="' + id + '"]').forEach(function(b){
        b.classList.toggle('is-liked', liked);
        var s = b.querySelector('span'); if(s) s.textContent = count;
      });
    }).catch(function () {
      // revert
      btn.classList.toggle('liked', wasLiked);
      if (span) span.textContent = curCount;
      Toast.show('操作失败', true);
    });
  },

  _toggleSave: function (id, btn) {
    if (!State.currentUser) { Toast.show('请先登录', true); return; }
    var span2 = btn.querySelector('span');
    var curCount2 = parseInt(span2 ? span2.textContent : '0') || 0;
    var wasSaved = btn.classList.contains('saved');
    btn.classList.toggle('saved', !wasSaved);
    if (span2) span2.textContent = wasSaved ? Math.max(0, curCount2-1) : curCount2+1;
    API.toggleSave(id).then(function (r) {
      var saved = r.saved !== undefined ? r.saved : !wasSaved;
      var count = r.saves !== undefined ? r.saves : (saved ? curCount2+1 : Math.max(0,curCount2-1));
      btn.classList.toggle('saved', saved);
      if (span2) span2.textContent = count;
      if (saved) { if (State.userSaves.indexOf(id)<0) State.userSaves.push(id); }
      else State.userSaves = State.userSaves.filter(function (x) { return x !== id; });
      document.querySelectorAll('[data-action="save"][data-id="' + id + '"]').forEach(function(b){
        b.classList.toggle('is-saved', saved);
        var s = b.querySelector('span'); if(s) s.textContent = count;
      });
    }).catch(function () {
      btn.classList.toggle('saved', wasSaved);
      if (span2) span2.textContent = curCount2;
      Toast.show('操作失败', true);
    });
  },

};

/* ════════════════════════════════════════════════════════
   HIJACK desktop article opens on mobile
   — intercept Dialog.open('dlg-article') on mobile
════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () {
    if (!Mobile.isMobile()) return;

    // Disable old MobileNav if it exists
    if (typeof MobileNav !== 'undefined') {
      MobileNav.init = function () {};
      MobileNav.go   = function () {};
    }

    Mobile.init();

    // Intercept card "阅读" button clicks — they call Article.open(id)
    // We override Article.open on mobile
    var _origArticleOpen = Article.open.bind(Article);
    Article.open = function (id, focusComment) {
      if (Mobile.isMobile()) {
        Mobile.openArticle(id, focusComment);
      } else {
        _origArticleOpen(id, focusComment);
      }
    };

    // Feed card clicks — bind after each render
    var _origRenderFeed = App.renderFeed.bind(App);
    App.renderFeed = function () {
      _origRenderFeed();
      setTimeout(Mobile._bindFeedCards, 50);
    };
    // Also do initial bind
    setTimeout(Mobile._bindFeedCards, 500);

  }, 150);
});

Mobile._bindFeedCards = function () {
  if (!Mobile.isMobile()) return;
  document.querySelectorAll('.news-card[data-id]').forEach(function (card) {
    if (card._mobileBound) return;
    card._mobileBound = true;
    var id = card.dataset.id;
    card.addEventListener('click', function (e) {
      // Block if any data-action button was clicked (handled by app.js delegate)
      var btn = e.target.closest('[data-action]');
      if (btn) return;
      // Block if any button/a was clicked
      if (e.target.closest('button, a')) return;
      Mobile.openArticle(id);
    });
  });
};
