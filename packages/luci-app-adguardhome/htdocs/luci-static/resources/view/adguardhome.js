'use strict';
'require view';
'require fs';
'require uci';
'require ui';
'require poll';

var INIT = '/etc/init.d/adguardhome';
var BIN = '/opt/AdGuardHome/AdGuardHome';
var CFG = 'adguardhome';
var DEFAULT_PORT = '3000';

function currentPort() {
	return String(uci.get(CFG, 'main', 'web_port') || DEFAULT_PORT);
}

function currentProto() {
	return String(uci.get(CFG, 'main', 'web_proto') || 'http') === 'https' ? 'https' : 'http';
}

/* 始终跟随当前访问地址，LAN IP 改了也不用回来改菜单 */
function panelUrl(port, proto) {
	var host = window.location.hostname || '127.0.0.1';
	return (proto === 'https' ? 'https://' : 'http://') + host + ':' + port + '/';
}

function badgeCss(up) {
	return 'display:inline-block;padding:1px 10px;border-radius:10px;font-size:12px;' +
		'line-height:20px;color:#fff;background:' + (up ? '#2e7d32' : '#9e9e9e');
}

var FRAME_CSS = 'display:block;width:100%;height:calc(100vh - 340px);min-height:480px;' +
	'border:1px solid rgba(128,128,128,.25);border-radius:6px;background:#fff';

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(uci.load(CFG), null),
			L.resolveDefault(fs.exec(INIT, [ 'running' ]), { code: 1, stdout: '', stderr: '' }),
			L.resolveDefault(fs.exec(BIN, [ '--version' ]), { code: -1, stdout: '', stderr: '' })
		]);
	},

	render: function(res) {
		var self = this;
		var port = currentPort();
		var proto = currentProto();
		var running = (res[1].code === 0);

		this.running = running;
		this.hasCore = (res[2].code === 0);

		var vm = String(res[2].stdout || '').match(/v\d+(?:\.\d+)+[\w.\-]*/);
		this.version = vm ? vm[0] : (this.hasCore ? '未知' : '未安装');

		this.statusEl = E('span', { 'style': badgeCss(running) },
			running ? '运行中' : '未运行');

		this.urlEl = E('code', { 'style': 'font-size:12px;word-break:break-all' },
			panelUrl(port, proto));

		this.portEl = E('input', {
			'class': 'cbi-input-text',
			'type': 'text',
			'style': 'width:90px',
			'value': port,
			'placeholder': DEFAULT_PORT
		});

		this.frameEl = E('iframe', {
			'src': running ? panelUrl(port, proto) : 'about:blank',
			'style': FRAME_CSS + (running ? '' : ';display:none')
		});

		/* 服务未启动时不加载任何页面，只给一个说明 + 启动按钮 */
		this.placeholderEl = E('div', {
			'style': 'display:' + (running ? 'none' : 'block') + ';' +
				'padding:48px 24px;text-align:center;border:1px dashed rgba(128,128,128,.35);' +
				'border-radius:6px;background:rgba(128,128,128,.04)'
		}, [
			E('h4', { 'style': 'margin:0 0 12px;font-size:16px' }, 'AdGuard Home 未运行'),
			E('p', { 'style': 'margin:0 0 6px;color:inherit;opacity:.75' },
				'本固件只集成了 AdGuard Home 本体，默认不启动、不自启、不占用任何端口，'),
			E('p', { 'style': 'margin:0 0 6px;color:inherit;opacity:.75' },
				'也不修改 dnsmasq / OpenClash / DHCP 的任何配置——不用它的人完全不受影响。'),
			E('p', { 'style': 'margin:0 0 20px;color:inherit;opacity:.75' },
				'需要使用时点下面的按钮启动，随后会进入 AdGuard Home 自己的安装向导，端口与上游 DNS 由你自己设置。'),
			E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': function(ev) {
					ev.preventDefault();
					return self.handleAction('start');
				}
			}, '启动服务并进入配置向导')
		]);

		poll.add(function() {
			return fs.exec(INIT, [ 'running' ]).then(function(r) {
				self.setStatus(r.code === 0);
			}).catch(function() {});
		}, 10);

		return E('div', {}, [
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, 'AdGuard Home'),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, '服务状态'),
					E('div', { 'class': 'cbi-value-field' }, [
						this.statusEl,
						E('span', { 'class': 'cbi-value-description', 'style': 'margin-left:8px' },
							'核心版本 ' + this.version)
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, '面板地址'),
					E('div', { 'class': 'cbi-value-field' }, [ this.urlEl ])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, '面板端口'),
					E('div', { 'class': 'cbi-value-field' }, [
						this.portEl,
						' ',
						this.btn('同步', 'cbi-button-action', function() {
							return self.handleSavePort();
						}),
						E('span', { 'class': 'cbi-value-description' },
							' 在 AdGuard Home 里改过 Web 端口后，这里同步一下即可')
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, '快捷操作'),
					E('div', { 'class': 'cbi-value-field' }, [
						this.btn('启动', 'cbi-button-apply', function() {
							return self.handleAction('start');
						}),
						' ',
						this.btn('停止', 'cbi-button-reset', function() {
							return self.handleAction('stop');
						}),
						' ',
						this.btn('重启', 'cbi-button-action', function() {
							return self.handleAction('restart');
						}),
						' ',
						this.btn('新窗口打开', '', function() {
							window.open(panelUrl(currentPort(), currentProto()), '_blank');
							return Promise.resolve();
						}),
						' ',
						this.btn('刷新面板', '', function() {
							self.reloadFrame();
							return Promise.resolve();
						})
					])
				]),
				E('div', { 'class': 'cbi-section-descr' }, [
					E('strong', {}, '本页只是入口，不接管 DNS。'),
					' 53 端口始终归 dnsmasq / OpenClash 所有，本包未写入任何 DNS、DHCP、防火墙配置。',
					E('br'),
					'若下方面板空白或提示拒绝连接，请先确认服务已启动、且「面板端口」与 AdGuard Home 内设置的一致。'
				])
			]),
			E('div', { 'class': 'cbi-section' }, [ this.placeholderEl, this.frameEl ])
		]);
	},

	btn: function(label, cls, fn) {
		return E('button', {
			'class': 'cbi-button' + (cls ? ' ' + cls : ''),
			'click': function(ev) {
				ev.preventDefault();
				return fn();
			}
		}, label);
	},

	setStatus: function(up) {
		this.running = up;

		if (this.statusEl) {
			this.statusEl.textContent = up ? '运行中' : '未运行';
			this.statusEl.style.cssText = badgeCss(up);
		}

		if (!this.frameEl || !this.placeholderEl)
			return;

		this.frameEl.style.display = up ? 'block' : 'none';
		this.placeholderEl.style.display = up ? 'none' : 'block';

		if (up) {
			if (!this.frameEl.src || this.frameEl.src === 'about:blank')
				this.frameEl.src = panelUrl(currentPort(), currentProto());
		}
		else {
			this.frameEl.src = 'about:blank';
		}
	},

	reloadFrame: function() {
		if (!this.frameEl || !this.running)
			return;

		var url = panelUrl(currentPort(), currentProto());
		this.frameEl.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + '_ts=' + Date.now();
	},

	handleAction: function(action) {
		var self = this;
		var label = { start: '启动', stop: '停止', restart: '重启' }[action] || action;

		if (!this.hasCore) {
			ui.addNotification(null, E('p', {},
				'未检测到 AdGuard Home 核心，请确认 /opt/AdGuardHome/AdGuardHome 是否存在'), 'error');
			return Promise.resolve();
		}

		/* 手动启动时一并 enable，之后开机才会自启；用户也可以随时点「停止」 */
		var work = (action === 'start')
			? fs.exec(INIT, [ 'enable' ]).then(function() { return fs.exec(INIT, [ 'start' ]); })
			: fs.exec(INIT, [ action ]);

		return work.then(function() {
			/* 等服务真正起来/停掉再回读状态，避免读到中间态 */
			return new Promise(function(resolve) { window.setTimeout(resolve, 1500); });
		}).then(function() {
			return fs.exec(INIT, [ 'running' ]);
		}).then(function(r) {
			self.setStatus(r.code === 0);
			ui.addNotification(null, E('p', {}, '已执行「' + label + '」'), 'info');
		}).catch(function(e) {
			ui.addNotification(null, E('p', {},
				'操作失败：' + (e && e.message ? e.message : e)), 'error');
		});
	},

	handleSavePort: function() {
		var self = this;
		var v = String(this.portEl.value || '').trim();
		var n = parseInt(v, 10);

		if (!/^[0-9]+$/.test(v) || isNaN(n) || n < 1 || n > 65535) {
			ui.addNotification(null, E('p', {}, '端口必须是 1-65535 之间的整数'), 'error');
			return Promise.resolve();
		}

		/*
		 * 这里只改「LuCI 面板指向的端口」，与 AdGuard Home 自身监听端口无关，
		 * 所以不重启服务。用 uci 命令直接落盘，避免 uci.save() 仅写内存 delta
		 * 导致重启后丢失，也避免 uci.apply() 的全局 rollback 影响其它配置。
		 */
		return fs.exec('/sbin/uci', [ 'set', CFG + '.main.web_port=' + v ]).then(function(r) {
			if (r.code !== 0)
				throw new Error(r.stderr || '写入失败');
			return fs.exec('/sbin/uci', [ 'commit', CFG ]);
		}).then(function(r) {
			if (r.code !== 0)
				throw new Error(r.stderr || '提交失败');
			return uci.load(CFG);
		}).then(function() {
			self.urlEl.textContent = panelUrl(v, currentProto());
			self.reloadFrame();
			ui.addNotification(null, E('p', {}, '面板端口已同步为 ' + v), 'info');
		}).catch(function(e) {
			ui.addNotification(null, E('p', {},
				'保存失败：' + (e && e.message ? e.message : e)), 'error');
		});
	}
});
