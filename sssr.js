/* СССР for Lampa — 0.1.5 */
(function(window) {
'use strict';
var modules = {
"about": function(module, exports, require) {
'use strict';
var release = require('./release.json');
var logo = require('./tmdb-logo.json');
function showAbout(Lampa,win,onClose) {
    var content = win.document.createElement('div');
    content.className = 'about soviet-about';
    function paragraph(text) {
        var element = win.document.createElement('p'); element.textContent = text;
        content.appendChild(element); return element;
    }
    function link(text,url,key) {
        var line = paragraph(''); var element = win.document.createElement('a');
        element.textContent = text; element.href = url; element.target = '_blank'; element.rel = 'noopener noreferrer';
        element.setAttribute('data-soviet-link',key); line.appendChild(element); return element;
    }
    paragraph('Версия ' + release.version + ' · публичная бета · Автор: ' + release.author);
    paragraph('Фильмы, мультфильмы и сериалы СССР с фильтрами по жанру и десятилетию.');
    paragraph('Ошибки и предложения — ссылка для телефона или компьютера:');
    link(release.issues,release.issues,'issues');
    paragraph('Проверено: Lampa 3.3.7 в браузере, LG webOS и Android TV.');
    paragraph('Данные и постеры: TMDB. Классификация зависит от источника. Просмотр — через установленные источники Lampa.');
    var image = win.document.createElement('img'); image.alt = 'TMDB';
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logo.svg);
    image.style.cssText = 'display:block;width:8em;height:auto';
    link('','https://www.themoviedb.org/','tmdb').appendChild(image);
    paragraph('This product uses the TMDB API but is not endorsed or certified by TMDB.');
    var open = true;
    function close() {
        if (!open) return;
        open = false;
        var modal = Lampa.Modal.render();
        if (modal && modal[0] && modal[0].contains(content)) Lampa.Modal.close();
        onClose();
    }
    Lampa.Modal.open({title:'О плагине «' + release.name + '»',html:win.$(content),size:'large',buttons_position:'outside',
        buttons:[{name:'Закрыть',onSelect:close}],onBack:close});
    var modal = Lampa.Modal.render();
    var closeButton = modal && modal[0] && modal[0].querySelector('.modal__button');
    if (closeButton) {
        Lampa.Controller.collectionSet(modal,false,true);
        Lampa.Controller.collectionFocus(closeButton,modal,true);
    }
    return close;
}
module.exports = {showAbout:showAbout};

},
"additions": function(module, exports, require) {
'use strict';
var query = require('./query');
function selectAdditions(records, selection) {
    var s = query.normalizeSelection(selection);
    var type = query.mediaType(s);
    var filtered = records.filter(function(card) {
        if (card.media_type !== type) return false;
        var genres = card.genre_ids || (card.genres || []).map(function(g) { return g.id; });
        var animation = genres.indexOf(16) >= 0;
        if (animation !== (s.section === 'animation') || (s.genreId && genres.indexOf(s.genreId) < 0)) return false;
        var date = type === 'tv' ? card.first_air_date : card.release_date;
        if (s.decade !== 'all') {
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
            var year = parseInt(date.substring(0,4),10);
            if (year < s.decade || year > (s.decade === 1990 ? 1991 : s.decade + 9)) return false;
        }
        return true;
    });
    function value(card) {
        if (s.sort === 'title') return card.title || card.name || '';
        if (s.sort === 'yearAsc' || s.sort === 'yearDesc') return type === 'tv' ? card.first_air_date : card.release_date;
        return card[s.sort === 'rating' ? 'vote_average' : 'popularity'];
    }
    filtered.sort(function(a,b) {
        var av = value(a), bv = value(b), result = 0;
        var am = av === undefined || av === null || av === '', bm = bv === undefined || bv === null || bv === '';
        if (am !== bm) return am ? 1 : -1;
        if (!am) {
            if (s.sort === 'title') result = av.localeCompare(bv,'ru');
            else result = av < bv ? -1 : av > bv ? 1 : 0;
            if (s.sort !== 'title' && s.sort !== 'yearAsc') result = -result;
        }
        return result || a.id - b.id;
    });
    return filtered;
}
function loadAdditions(request, entries, success, failure) {
    var cancelled = false;
    var cancelRequest;
    var index = 0;
    var records = [];
    function next() {
        if (cancelled) return;
        if (index === entries.length) return success(records);
        var entry = entries[index++];
        cancelRequest = request({path:entry.media_type + '/' + entry.id,params:{language:'ru-RU'}},function(data) {
            if (cancelled) return;
            if (!data || data.id !== entry.id) return failure(new Error('Не удалось загрузить дополнения'));
            var card = {};
            Object.keys(data).forEach(function(k) { card[k] = data[k]; });
            card.media_type = entry.media_type;
            card.source = 'tmdb';
            card.genre_ids = (data.genres || []).map(function(g) { return g.id; });
            records.push(card);
            next();
        },function() { if (!cancelled) failure(new Error('Не удалось загрузить дополнения')); });
    }
    next();
    return function() { cancelled = true; if (cancelRequest) cancelRequest(); };
}
module.exports = {selectAdditions:selectAdditions,loadAdditions:loadAdditions};

},
"catalog-screen": function(module, exports, require) {
'use strict';
var query = require('./query');
var createAdapter = require('./lampa-adapter').createAdapter;
var createState = require('./catalog-state').createCatalogState;
var additions = require('./additions');
var showAbout = require('./about').showAbout;
var DECADES = [{title:'Все годы',value:'all'}];
[1920,1930,1940,1950,1960,1970,1980,1990].forEach(function(year) { DECADES.push({title:year === 1990 ? '1990–1991' : year + '-е',value:year}); });
var SORTS = [{title:'По популярности',value:'popularity'},{title:'По рейтингу',value:'rating'},{title:'Год: от старых к новым',value:'yearAsc'},{title:'Год: от новых к старым',value:'yearDesc'},{title:'По названию',value:'title'}];
var TYPES = [{title:'Мультфильмы',value:'movie'},{title:'Мультсериалы',value:'tv'}];
function label(items,value) {
    var result = items.filter(function(item) { return item.value === value; })[0];
    return result ? result.title : '';
}
function createCatalogScreen(Lampa, win, corrections) {
    var document = win.document;
    var adapter = createAdapter(Lampa);
    return function CatalogScreen(object) {
        var self = this;
        var root = document.createElement('div');
        root.className = 'soviet-cinema';
        var scroll = new Lampa.Scroll({mask:true,over:true,step:250,end_ratio:2});
        var toolbar = document.createElement('div'); toolbar.className = 'soviet-toolbar';
        var grid = document.createElement('div'); grid.className = 'soviet-grid mapping--grid cols--6';
        var status = document.createElement('div'); status.className = 'soviet-status'; status.setAttribute('role','status');
        var actions = document.createElement('div'); actions.className = 'soviet-toolbar';
        var controls = {}, cards = [], rendered = 0, last = null, active = false, dead = false;
        var genres = {}, genreCancel, extraCancel, aboutClose, interaction = 0, extraCards = object.additionsRecords || [];
        var request = adapter.request;
        if (object.additions) request = function(q,resolve) {
            var records = additions.selectAdditions(extraCards,state.selection);
            resolve({page:1,total_pages:1,results:records});
            return function() {};
        };
        var state = createState(request,corrections,object.selection || {section:object.section || 'movies',animationType:object.animationType || 'movie'},render);
        function button(parent,text,key,action,attribute) {
            var b = document.createElement('div');
            b.className = 'simple-button selector soviet-button'; b.setAttribute('tabindex','0');
            b.setAttribute(attribute || 'data-soviet-control',key); b.textContent = text;
            b.addEventListener('hover:enter',function() {
                interaction++; last = b; state.focusKey = 'control:' + key; action();
            });
            b.addEventListener('hover:focus',function() {
                if (last !== b) interaction++;
                last = b; state.focusKey = 'control:' + key; scroll.update(b,true);
            });
            parent.appendChild(b); return b;
        }
        function showChoice(key,title,items) {
            if (dead || !active) return;
            Lampa.Select.show({title:title,items:items.map(function(item) {
                return {title:item.title,value:item.value,selected:state.selection[key] === item.value};
            }),onSelect:function(item) {
                interaction++;
                Lampa.Select.close();
                var next = query.normalizeSelection(state.selection); next[key] = item.value;
                if (key === 'animationType') next.genreId = 0;
                clearCards(); last = controls[key]; scroll.reset();
                state.select(next); state.focusKey = 'control:' + key;
                self.start();
            },onBack:function() { interaction++; Lampa.Controller.toggle('content'); }});
        }
        function chooseGenre() {
            var type = query.mediaType(state.selection), intent = interaction;
            function current() { return !dead && active && intent === interaction && Lampa.Controller.own(self) && query.mediaType(state.selection) === type; }
            function genreError() { if (current() && Lampa.Noty) Lampa.Noty.show('Не удалось загрузить жанры. Повторите выбор.'); }
            function show() {
                if (!current()) return;
                var items = [{title:'Все жанры',value:0}].concat(genres[type].filter(function(g) { return g.id !== 16; }).map(function(g) { return {title:g.name,value:g.id}; }));
                showChoice('genreId','Жанр',items);
            }
            if (genres[type]) return show();
            if (genreCancel) genreCancel();
            genreCancel = adapter.request({path:'genre/' + type + '/list',params:{language:'ru-RU'}},function(data) {
                if (dead) return;
                if (!data || !Array.isArray(data.genres)) return genreError();
                genres[type] = data.genres;
                show();
            },genreError);
        }
        controls.genreId = button(toolbar,'Жанр: Все жанры','genre',chooseGenre);
        // The DOM key is user-facing/testable; the selection key remains genreId.
        controls.genre = controls.genreId;
        controls.decade = button(toolbar,'Десятилетие: Все годы','decade',function() { showChoice('decade','Десятилетие',DECADES); });
        controls.sort = button(toolbar,'Сортировка: По популярности','sort',function() { showChoice('sort','Сортировка',SORTS); });
        if (state.selection.section === 'animation') controls.animationType = button(toolbar,'Каталог: Мультфильмы','animationType',function() { showChoice('animationType','Мультфильмы',TYPES); });
        controls.about = button(toolbar,'О плагине','about',function() {
            if (dead || !active || aboutClose) return;
            aboutClose = showAbout(Lampa,win,function() {
                aboutClose = null; interaction++;
                if (!dead && active) Lampa.Controller.toggle('content');
            });
        });
        function focusPageEnd() { last = grid.lastElementChild || controls.genre; }
        var retry = button(actions,'Повторить','retry',function() { focusPageEnd(); state.retry(); },'data-soviet-action');
        var more = button(actions,'Загрузить ещё','more',function() { focusPageEnd(); state.loadNext(); },'data-soviet-action');
        var reset = button(actions,'Сбросить фильтры','reset',function() {
            clearCards(); last = controls.decade; scroll.reset();
            state.select({section:state.selection.section,animationType:state.selection.animationType}); self.start();
        },'data-soviet-action');
        var extraButton;
        function updateExtras() {
            if (object.additions || extraButton || dead) return;
            var sectionSelection = {section:state.selection.section,animationType:state.selection.animationType};
            if (additions.selectAdditions(extraCards,sectionSelection).length) extraButton = button(toolbar,'Дополнения к каталогу','additions',function() {
                Lampa.Activity.push({url:'',component:'soviet_cinema',title:'Дополнения к каталогу',selection:query.normalizeSelection(state.selection),additions:true,additionsRecords:extraCards,page:1});
            });
        }
        function clearCards() {
            cards.forEach(function(card) { card.destroy(); }); cards = []; rendered = 0;
        }
        function refresh() {
            if (dead) return;
            Lampa.Layer.visible(scroll.render(true));
            if (active && Lampa.Controller.own(self)) {
                Lampa.Controller.collectionSet(root,false,true);
                var target = last && root.contains(last) && last.style.display !== 'none' ? last : (grid.querySelector('.selector') || controls.genre);
                Lampa.Controller.collectionFocus(target,root,true);
            }
        }
        function render() {
            if (dead) return;
            while (rendered < state.cards.length) {
                (function(index) {
                    var data = state.cards[index];
                    var card = Lampa.Maker.make('Card',data);
                    card.use({onlyEnter:function() {
                        interaction++;
                        last = card.render(true); state.focusKey = data.media_type + ':' + data.id;
                        adapter.openCard(data);
                    },onFocus:function() {
                        if (last !== card.render(true)) interaction++;
                        last = card.render(true); state.focusKey = data.media_type + ':' + data.id;
                        scroll.update(last,true);
                        if (index >= state.cards.length - 6) state.loadNext();
                    }});
                    card.create(); grid.appendChild(card.render(true)); cards.push(card);
                })(rendered++);
            }
            var s = state.selection;
            var genre = (genres[query.mediaType(s)] || []).filter(function(g) { return g.id === s.genreId; })[0];
            controls.genre.textContent = 'Жанр: ' + (genre ? genre.name : 'Все жанры');
            controls.decade.textContent = 'Десятилетие: ' + label(DECADES,s.decade);
            controls.sort.textContent = 'Сортировка: ' + label(SORTS,s.sort);
            if (controls.animationType) controls.animationType.textContent = 'Каталог: ' + label(TYPES,s.animationType);
            retry.style.display = state.error ? '' : 'none';
            more.style.display = !state.loading && !state.error && state.hasMore && state.cards.length ? '' : 'none';
            reset.style.display = !state.loading && !state.error && (!state.cards.length || state.pageLimitReached) ? '' : 'none';
            status.textContent = state.error ? 'Не удалось загрузить каталог. Повторите попытку.' : state.loading ? 'Загрузка…' : !state.cards.length ? 'По выбранным фильтрам ничего не найдено' : state.pageLimitReached ? 'Доступный список просмотрен. Уточните жанр или десятилетие.' : 'Загружено: ' + state.cards.length;
            if (self.activity) self.activity.loader(false);
            updateExtras(); refresh();
        }
        self.create = function() {
            scroll.minus(); scroll.append(toolbar); scroll.append(grid); scroll.append(status); scroll.append(actions);
            root.appendChild(scroll.render(true));
            scroll.onScroll = function() { if (!dead) Lampa.Layer.visible(scroll.render(true)); };
            scroll.onEnd = function() { if (active) state.loadNext(); };
            state.loadNext();
            if (!object.additions && corrections.additions.length) extraCancel = additions.loadAdditions(adapter.request,corrections.additions,function(records) { extraCards = records; if (!dead) { updateExtras(); refresh(); } },function() {});
            return self.render(true);
        };
        self.start = function() {
            if (dead) return;
            active = true;
            var controller = {link:self,invisible:true,toggle:function() { scroll.restorePosition(); refresh(); },gone:function(name) { if (name !== 'content') interaction++; },back:function() { interaction++; Lampa.Activity.backward(); }};
            ['up','down','left','right'].forEach(function(direction) {
                controller[direction] = function() {
                    if (win.Navigator.canmove(direction)) win.Navigator.move(direction);
                    else if (direction === 'left') Lampa.Controller.toggle('menu');
                    else if (direction === 'up') Lampa.Controller.toggle('head');
                    else if (direction === 'down') state.loadNext();
                };
            });
            Lampa.Controller.add('content',controller); Lampa.Controller.toggle('content');
        };
        self.pause = function() { active = false; interaction++; };
        self.render = function(js) { return js ? root : win.$(root); };
        self.destroy = function() {
            dead = true; active = false; state.destroy();
            if (aboutClose) aboutClose();
            if (genreCancel) genreCancel(); if (extraCancel) extraCancel();
            clearCards(); scroll.onEnd = null; scroll.onScroll = null; scroll.destroy(); root.remove();
        };
    };
}
module.exports = {createCatalogScreen:createCatalogScreen};

},
"catalog-state": function(module, exports, require) {
'use strict';
var createProvider = require('./provider').createProvider;
var normalize = require('./query').normalizeSelection;
function createCatalogState(request, corrections, selection, changed) {
    var provider = createProvider(request,corrections);
    var dead = false;
    var seen = {};
    var state = {selection:normalize(selection),cards:[],loadedPages:[],nextPage:1,loading:false,hasMore:true,error:null,pageLimitReached:false,focusKey:null};
    function notify() { if (!dead) changed(state); }
    function loadNext() {
        if (dead || state.loading || !state.hasMore || state.error) return;
        state.loading = true;
        notify();
        provider.load(state.selection,state.nextPage,function(data) {
            state.loading = false;
            state.error = null;
            state.loadedPages.push(data.page);
            state.nextPage = data.page + 1;
            state.hasMore = data.hasMore;
            state.pageLimitReached = data.pageLimitReached;
            data.results.forEach(function(card) {
                var key = card.media_type + ':' + card.id;
                if (!seen[key]) { seen[key] = true; state.cards.push(card); }
            });
            if (!data.results.length && state.hasMore) loadNext();
            else notify();
        },function() { state.loading = false; state.error = 'Не удалось загрузить каталог'; notify(); });
    }
    state.loadNext = loadNext;
    state.retry = function() { if (dead) return; state.error = null; loadNext(); };
    state.select = function(next) {
        if (dead) return;
        var normalized = normalize(next);
        provider.reset();
        seen = {};
        state.selection = normalized;
        state.cards = [];
        state.loadedPages = [];
        state.nextPage = 1;
        state.loading = false;
        state.hasMore = true;
        state.error = null;
        state.focusKey = null;
        state.pageLimitReached = false;
        loadNext();
    };
    state.destroy = function() { dead = true; provider.destroy(); };
    return state;
}
module.exports = {createCatalogState:createCatalogState};

},
"corrections.json": function(module, exports, require) {
module.exports = {"version":1,"exclusions":[],"additions":[]};
},
"lampa-adapter": function(module, exports, require) {
'use strict';
function createAdapter(Lampa) {
    function request(query, success, failure) {
        var network = new Lampa.Reguest();
        var cancelled = false;
        var params = [];
        Object.keys(query.params || {}).forEach(function(key) {
            params.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(query.params[key])));
        });
        params.push('api_key=' + encodeURIComponent(Lampa.TMDB.key()));
        var url = Lampa.TMDB.api(query.path + '?' + params.join('&'));
        network.timeout(10000);
        network.silent(url,function(data) { if (!cancelled) success(data); },function() {
            if (!cancelled) failure(new Error('Не удалось загрузить данные TMDB'));
        },false,{});
        return function() { cancelled = true; network.clear(); };
    }
    function openCard(card) {
        Lampa.Activity.push({url:'',component:'full',source:'tmdb',id:card.id,method:card.media_type,card:card,page:1});
    }
    return {request:request,openCard:openCard};
}
module.exports = {createAdapter:createAdapter};

},
"plugin": function(module, exports, require) {
'use strict';
var createCatalogScreen = require('./catalog-screen').createCatalogScreen;
var corrections = require('./corrections.json');
var release = require('./release.json');
var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 3v18M16 3v18M3 8h5M3 16h5M16 8h5M16 16h5M8 12h8"/></svg>';
function supports(Lampa,win) {
    var methods = [[Lampa.Menu,'addButton'],[Lampa.Component,'add'],[Lampa.Activity,'push'],[Lampa.Activity,'backward'],[Lampa.Maker,'make'],[Lampa.Select,'show'],[Lampa.Select,'close'],[Lampa.Layer,'visible'],[Lampa.Controller,'add'],[Lampa.Controller,'toggle'],[Lampa.Controller,'own'],[Lampa.Controller,'collectionSet'],[Lampa.Controller,'collectionFocus'],[Lampa.TMDB,'api'],[Lampa.TMDB,'key'],[win.Navigator,'move'],[win.Navigator,'canmove']];
    methods.push([Lampa.Modal,'open'],[Lampa.Modal,'close'],[Lampa.Modal,'render']);
    return typeof win.$ === 'function' && typeof Lampa.Reguest === 'function' && typeof Lampa.Scroll === 'function' && methods.every(function(item) { return item[0] && typeof item[0][item[1]] === 'function'; });
}
function install(win) {
    if (win.__sovietCinemaInstalled) return;
    var guard = {status:'waiting',timer:null,attempts:0};
    win.__sovietCinemaInstalled = guard;
    function notice() {
        guard.status = 'unsupported';
        var message = release.name + ': эта версия Lampa несовместима с плагином.';
        if (win.Lampa && win.Lampa.Noty) win.Lampa.Noty.show(message);
        else {
            var element = win.document.createElement('div'); element.setAttribute('role','status'); element.textContent = message;
            element.style.cssText = 'position:fixed;bottom:2em;left:2em;right:2em;padding:1em;background:#222;color:#fff;z-index:99999';
            win.document.body.appendChild(element);
        }
    }
    function start() {
        if (guard.status !== 'waiting') return;
        var Lampa = win.Lampa;
        if (!supports(Lampa,win)) return notice();
        var style = win.document.createElement('style');
        style.textContent = '.soviet-cinema{height:100%}.soviet-toolbar{display:flex;flex-wrap:wrap;margin:0 1.3em 1.4em}.soviet-button{padding:.65em 1em;min-height:2.4em;margin:0 .6em .6em 0}.soviet-status{padding:1em 1.3em;opacity:.8}.soviet-grid{margin-bottom:1em}.soviet-about p{margin-bottom:.8em;line-height:1.45}.soviet-about a{color:inherit;text-decoration:underline;word-wrap:break-word}';
        win.document.head.appendChild(style);
        Lampa.Component.add('soviet_cinema',createCatalogScreen(Lampa,win,corrections));
        Lampa.Menu.addButton(ICON,release.name,function() {
            var items = [{title:'Фильмы',section:'movies'},{title:'Мультфильмы',section:'animation'},{title:'Сериалы',section:'series'}];
            Lampa.Select.show({title:release.name,items:items,onSelect:function(item) {
                Lampa.Select.close();
                Lampa.Activity.push({url:'',title:release.name + ' — ' + item.title,component:'soviet_cinema',section:item.section,selection:{section:item.section},page:1});
            },onBack:function() { Lampa.Controller.toggle('menu'); }});
        });
        guard.status = 'ready';
    }
    function wait() {
        if (win.Lampa && win.appready) return start();
        if (win.Lampa && win.Lampa.Listener && typeof win.Lampa.Listener.follow === 'function') {
            win.Lampa.Listener.follow('app',function(event) { if (event.type === 'ready') start(); });
        } else if (++guard.attempts < 300) guard.timer = win.setTimeout(wait,100);
        else notice();
    }
    wait();
}
module.exports = {install:install};

},
"provider": function(module, exports, require) {
'use strict';
var query = require('./query');
function createProvider(request, corrections) {
    var generation = 0;
    var destroyed = false;
    var current = null;
    var pending = {};
    var exclusions = {};
    (corrections.exclusions || []).forEach(function(item) { exclusions[item.media_type + ':' + item.id] = true; });
    function reset() {
        generation++;
        var old = pending;
        pending = {};
        current = null;
        Object.keys(old).forEach(function(key) {
            old[key].done = true;
            if (old[key].cancel) old[key].cancel();
        });
    }
    function load(selection, page, success, failure) {
        if (destroyed) throw new Error('Provider destroyed');
        var s = query.normalizeSelection(selection);
        var q = query.buildQuery(s,page);
        var key = JSON.stringify(s);
        if (current !== key) { reset(); current = key; }
        if (pending[page]) return;
        var token = {generation:generation, done:false};
        pending[page] = token;
        function active() { return !destroyed && !token.done && token.generation === generation; }
        function finish() { token.done = true; delete pending[page]; }
        function fail() { if (active()) { finish(); failure(new Error('Не удалось загрузить каталог')); } }
        try {
            token.cancel = request(q,function(data) {
                if (!active()) return;
                if (!data || !Array.isArray(data.results) || data.page !== page || typeof data.total_pages !== 'number' || !isFinite(data.total_pages) || data.total_pages < 0 || data.total_pages !== Math.floor(data.total_pages)) return fail();
                var cards = data.results.filter(function(item) { return item && !exclusions[q.media_type + ':' + item.id]; }).map(function(item) {
                    var card = {};
                    Object.keys(item).forEach(function(k) { card[k] = item[k]; });
                    card.media_type = q.media_type;
                    card.source = 'tmdb';
                    return card;
                });
                finish();
                success({results:cards,page:page,total_pages:data.total_pages,hasMore:page < Math.min(data.total_pages,500),pageLimitReached:page === 500 && data.total_pages > 500});
            },fail);
        } catch (error) { fail(); }
    }
    return {load:load,reset:reset,destroy:function() { destroyed = true; reset(); }};
}
module.exports = {createProvider:createProvider};

},
"query": function(module, exports, require) {
'use strict';
var MOVIE_GENRES = [28,12,16,35,80,99,18,10751,14,36,27,10402,9648,10749,878,10770,53,10752,37];
var TV_GENRES = [10759,16,35,80,99,18,10751,10762,9648,10763,10764,10765,10766,10767,10768,37];
var SORTS = {
    popularity: ['popularity.desc','popularity.desc'],
    rating: ['vote_average.desc','vote_average.desc'],
    yearAsc: ['primary_release_date.asc','first_air_date.asc'],
    yearDesc: ['primary_release_date.desc','first_air_date.desc'],
    title: ['title.asc','name.asc']
};
function mediaType(selection) {
    return selection.section === 'series' || (selection.section === 'animation' && selection.animationType === 'tv') ? 'tv' : 'movie';
}
function normalizeSelection(input) {
    input = input || {};
    var s = {
        section: input.section === undefined ? 'movies' : input.section,
        animationType: input.animationType === undefined ? 'movie' : input.animationType,
        genreId: input.genreId === undefined ? 0 : input.genreId,
        decade: input.decade === undefined ? 'all' : input.decade,
        sort: input.sort === undefined ? 'popularity' : input.sort
    };
    if (['movies','animation','series'].indexOf(s.section) < 0 || ['movie','tv'].indexOf(s.animationType) < 0 || !Object.prototype.hasOwnProperty.call(SORTS,s.sort)) throw new Error('Invalid selection');
    if (s.decade !== 'all' && [1920,1930,1940,1950,1960,1970,1980,1990].indexOf(s.decade) < 0) throw new Error('Invalid decade');
    var genres = mediaType(s) === 'movie' ? MOVIE_GENRES : TV_GENRES;
    if (s.genreId !== 0 && (genres.indexOf(s.genreId) < 0 || (s.genreId === 16 && s.section !== 'animation'))) throw new Error('Invalid genre');
    return s;
}
function buildQuery(selection, page) {
    var s = normalizeSelection(selection);
    if (typeof page !== 'number' || page !== Math.floor(page) || page < 1 || page > 500) throw new Error('Invalid page');
    var type = mediaType(s);
    var params = { with_origin_country: 'SU', language: 'ru-RU', include_adult: false, page: page, sort_by: SORTS[s.sort][type === 'tv' ? 1 : 0] };
    if (s.section === 'animation') params.with_genres = s.genreId && s.genreId !== 16 ? '16,' + s.genreId : '16';
    else {
        params.without_genres = '16';
        if (s.genreId) params.with_genres = String(s.genreId);
    }
    if (type === 'tv') params.include_null_first_air_dates = s.decade === 'all';
    if (s.decade !== 'all') {
        var date = type === 'tv' ? 'first_air_date' : 'primary_release_date';
        params[date + '.gte'] = s.decade + '-01-01';
        params[date + '.lte'] = (s.decade === 1990 ? 1991 : s.decade + 9) + '-12-31';
    }
    return {media_type: type, path: 'discover/' + type, params: params};
}
module.exports = {buildQuery:buildQuery, normalizeSelection:normalizeSelection, mediaType:mediaType, movieGenres:MOVIE_GENRES, tvGenres:TV_GENRES};

},
"release.json": function(module, exports, require) {
module.exports = {"name":"СССР","version":"0.1.5","author":"c0ntrabanda","issues":"https://github.com/c0ntrabanda/sssr/issues"};
},
"tmdb-logo.json": function(module, exports, require) {
module.exports = {"source":"https://www.themoviedb.org/assets/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" viewBox=\"0 0 489.04 35.4\"><defs><style>.cls-1{fill:url(#linear-gradient);}</style><linearGradient id=\"linear-gradient\" y1=\"17.7\" x2=\"489.04\" y2=\"17.7\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#90cea1\"/><stop offset=\"0.56\" stop-color=\"#3cbec9\"/><stop offset=\"1\" stop-color=\"#00b3e5\"/></linearGradient></defs><title>Asset 5</title><g id=\"Layer_2\" data-name=\"Layer 2\"><g id=\"Layer_1-2\" data-name=\"Layer 1\"><path class=\"cls-1\" d=\"M293.5,0h8.9l8.75,23.2h.1L320.15,0h8.35L313.9,35.4h-6.25Zm46.6,0h7.8V35.4h-7.8Zm22.2,0h24.05V7.2H370.1v6.6h15.35V21H370.1v7.2h17.15v7.2H362.3Zm55,0H429a33.54,33.54,0,0,1,8.07,1A18.55,18.55,0,0,1,443.75,4a15.1,15.1,0,0,1,4.52,5.53A18.5,18.5,0,0,1,450,17.8a16.91,16.91,0,0,1-1.63,7.58,16.37,16.37,0,0,1-4.37,5.5,19.52,19.52,0,0,1-6.35,3.37A24.59,24.59,0,0,1,430,35.4H417.29Zm7.81,28.2h4a21.57,21.57,0,0,0,5-.55,10.87,10.87,0,0,0,4-1.83,8.69,8.69,0,0,0,2.67-3.34,11.92,11.92,0,0,0,1-5.08,9.87,9.87,0,0,0-1-4.52,9,9,0,0,0-2.62-3.18,11.68,11.68,0,0,0-3.88-1.88,17.43,17.43,0,0,0-4.67-.62h-4.6ZM461.24,0h13.2a34.42,34.42,0,0,1,4.63.32,12.9,12.9,0,0,1,4.17,1.3,7.88,7.88,0,0,1,3,2.73A8.34,8.34,0,0,1,487.39,9a7.42,7.42,0,0,1-1.67,5,9.28,9.28,0,0,1-4.43,2.82v.1a10,10,0,0,1,3.18,1,8.38,8.38,0,0,1,2.45,1.85,7.79,7.79,0,0,1,1.57,2.62,9.16,9.16,0,0,1,.55,3.2,8.52,8.52,0,0,1-1.2,4.68,9.42,9.42,0,0,1-3.1,3,13.38,13.38,0,0,1-4.27,1.65,23.11,23.11,0,0,1-4.73.5h-14.5ZM469,14.15h5.65a8.16,8.16,0,0,0,1.78-.2A4.78,4.78,0,0,0,478,13.3a3.34,3.34,0,0,0,1.13-1.2,3.63,3.63,0,0,0,.42-1.8,3.22,3.22,0,0,0-.47-1.82,3.33,3.33,0,0,0-1.23-1.13,5.77,5.77,0,0,0-1.7-.58,10.79,10.79,0,0,0-1.85-.17H469Zm0,14.65h7a8.91,8.91,0,0,0,1.83-.2,4.78,4.78,0,0,0,1.67-.7,4,4,0,0,0,1.23-1.3,3.71,3.71,0,0,0,.47-2,3.13,3.13,0,0,0-.62-2A4,4,0,0,0,479,21.45,7.83,7.83,0,0,0,477,20.9a15.12,15.12,0,0,0-2.05-.15H469Zm-265,6.53H271a17.66,17.66,0,0,0,17.66-17.66h0A17.67,17.67,0,0,0,271,0H204.06A17.67,17.67,0,0,0,186.4,17.67h0A17.66,17.66,0,0,0,204.06,35.33ZM10.1,6.9H0V0H28V6.9H17.9V35.4H10.1ZM39,0h7.8V13.2H61.9V0h7.8V35.4H61.9V20.1H46.75V35.4H39ZM80.2,0h24V7.2H88v6.6h15.35V21H88v7.2h17.15v7.2h-25Zm55,0H147l8.15,23.1h.1L163.45,0H175.2V35.4h-7.8V8.25h-.1L158,35.4h-5.95l-9-27.15H143V35.4h-7.8Z\"/></g></g></svg>"};
}
};
var cache = {};
function load(id) {
 id = id.replace(/^\.\//, "").replace(/\.js$/, "");
 if (cache[id]) return cache[id].exports;
 if (!modules[id]) throw new Error("Unknown module");
 var module = {exports: {}}; cache[id] = module;
 modules[id](module, module.exports, load);
 return module.exports;
}
var plugin = load("plugin");
if (plugin.install) plugin.install(window);
})(window);
