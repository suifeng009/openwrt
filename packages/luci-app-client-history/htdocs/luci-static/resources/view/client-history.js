'use strict';
'require view';
'require fs';
'require uci';
'require poll';

var CSV_PATH = '/root/client-history.csv';
var LOG_PATH = '/root/client-history.log';
var CFG = 'client-history';
var LOG_TAIL = 30;

function parseCSV(text) {
	var out = [];
	var lines = String(text || '').trim().split(/\r?\n/);

	if (lines.length < 2)
		return out;

	var head = lines.shift().split(',');

	for (var i = 0; i < lines.length; i++) {
		var line = lines[i];

		if (!line.trim())
			continue;

		var f = line.split(',');
		var o = {};

		for (var j = 0; j < head.length; j++)
			o[head[j].trim()] = (f[j] || '').trim();

		if (o.mac)
			out.push(o);
	}

	return out;
}

function parseLog(text) {
	return String(text || '').trim().split(/\r?\n/).filter(function(l) {
		return l.trim().length > 0;
	}).slice(-LOG_TAIL).reverse().map(function(l) {
		var f = l.split(',');
		return { time: f[0] || '', mac: f[1] || '', ip: f[2] || '', host: f[3] || '', event: f[4] || '' };
	});
}

/* 本地管理位为 1 的 MAC 是手机自己生成的随机地址，不可作为身份 */
function isRandomMAC(mac) {
	var b = parseInt(String(mac || '').split(':')[0], 16);
	return !isNaN(b) && (b & 2) !== 0;
}

function aliasMap() {
	var map = {};

	uci.sections(CFG, 'device').forEach(function(s) {
		var mac = String(s.mac || '').toLowerCase();
		var name = String(s.name || '').trim();

		if (mac && name)
			map[mac] = name;
	});

	return map;
}

function sectionOf(mac) {
	var found = null;

	uci.sections(CFG, 'device').forEach(function(s) {
		if (String(s.mac || '').toLowerCase() === mac)
			found = s['.name'];
	});

	return found;
}

function setAlias(mac, alias) {
	var sid = sectionOf(mac);
	alias = String(alias || '').trim();

	if (!alias) {
		if (sid)
			uci.remove(CFG, sid);
		return;
	}

	if (!sid)
		sid = uci.add(CFG, 'device');

	uci.set(CFG, sid, 'mac', mac);
	uci.set(CFG, sid, 'name', alias);
}

/* 把「已命名」的多个 MAC 合成一台设备；未命名的一律单独成行，绝不猜 */
function groupRows(rows, names) {
	var groups = [];
	var byAlias = {};

	rows.forEach(function(r) {
		var nm = names[r.mac];

		if (nm) {
			if (byAlias[nm]) {
				byAlias[nm].items.push(r);
				return;
			}

			var g = { alias: nm, items: [r] };
			byAlias[nm] = g;
			groups.push(g);
			return;
		}

		groups.push({ alias: null, items: [r] });
	});

	groups.forEach(function(g) {
		var online = 0, first = '', last = '', count = 0;
		var ips = [], macs = [], host = '';

		g.items.forEach(function(r) {
			if (r.online === '1')
				online++;

			if (r.first_seen && r.first_seen !== '-' && (!first || r.first_seen < first))
				first = r.first_seen;

			if (r.last_online && r.last_online > last)
				last = r.last_online;

			count += parseInt(r.count || '0', 10) || 0;

			if (r.ip && ips.indexOf(r.ip) < 0) ips.push(r.ip);
			if (r.mac && macs.indexOf(r.mac) < 0) macs.push(r.mac);
			if (!host && r.hostname && r.hostname !== '-') host = r.hostname;
		});

		g.online = online > 0;
		g.first = first;
		g.last = last;
		g.count = count;
		g.ips = ips;
		g.macs = macs;
		g.host = host;
		g.random = macs.length > 0 && macs.every(isRandomMAC);
	});

	/* 先排序，再分配序号，保证 #1 永远是排在最前面的那台 */
	groups.sort(function(a, b) {
		if (a.online !== b.online) return a.online ? -1 : 1;
		return String(b.last).localeCompare(String(a.last));
	});

	/* 同主机名多组时加序号；当前同时在线的组数 >= 2 则确定是多台设备 */
	var byHost = {};

	groups.forEach(function(g) {
		if (!g.host) return;
		(byHost[g.host] = byHost[g.host] || []).push(g);
	});

	Object.keys(byHost).forEach(function(h) {
		var list = byHost[h];
		var live = list.filter(function(g) { return g.online; }).length;

		if (list.length < 2)
			return;

		list.forEach(function(g, i) {
			g.tag = '#' + (i + 1);

			if (live >= 2 && g.online)
				g.multi = live;
		});
	});

	return groups;
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fs.read(CSV_PATH), ''),
			L.resolveDefault(fs.read(LOG_PATH), ''),
			L.resolveDefault(uci.load(CFG), null)
		]);
	},

	render: function(data) {
		var self = this;

		this.csvText = data[0];
		this.logText = data[1];
		this.tbody = E('tbody');
		this.logBody = E('tbody');
		this.summary = E('p', { 'class': 'cbi-section-descr' });
		this.notice = E('p', { 'class': 'cbi-section-descr' });

		this.fill();

		poll.add(function() {
			/* 用户正在改别名时不刷新，避免把输入冲掉 */
			var dirty = false;

			document.querySelectorAll('input.ah-name').forEach(function(inp) {
				if (inp.value !== (inp.getAttribute('data-orig') || ''))
					dirty = true;
			});

			if (dirty)
				return Promise.resolve();

			return Promise.all([
				L.resolveDefault(fs.read(CSV_PATH), ''),
				L.resolveDefault(fs.read(LOG_PATH), '')
			]).then(function(d) {
				self.csvText = d[0];
				self.logText = d[1];
				self.fill();
			});
		}, 30);

		return E('div', {}, [
			E('h2', {}, _('客户端接入历史')),
			E('div', { 'class': 'cbi-section' }, [
				E('p', {},
					_('记录每台设备的首次接入、最近接入与接入次数。数据由 60 秒一次的 DHCP 租约快照生成，' +
					  '重启设备、sysupgrade 保留配置升级都不会丢。')),
				E('p', { 'class': 'cbi-section-descr' },
					_('手机默认开启「随机 MAC」，同一台手机在不同网络下会有多个 MAC 地址。' +
					  '在下面给同一个 MAC 起相同的别名，它们就会合并成一台设备。' +
					  '「首次接入」显示「部署前」表示这台设备在插件安装前就已经在线。')),
				this.notice,
				this.summary,
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th', 'style': 'width:40px' }, _('状态')),
						E('th', { 'class': 'th', 'style': 'width:150px' }, _('别名')),
						E('th', { 'class': 'th' }, _('主机名')),
						E('th', { 'class': 'th', 'style': 'width:130px' }, _('IPv4 地址')),
						E('th', { 'class': 'th', 'style': 'width:150px' }, _('MAC 地址')),
						E('th', { 'class': 'th', 'style': 'width:112px' }, _('首次接入')),
						E('th', { 'class': 'th', 'style': 'width:112px' }, _('最近接入')),
						E('th', { 'class': 'th', 'style': 'width:56px' }, _('次数'))
					]),
					this.tbody
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('最近上下线记录')),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th', 'style': 'width:150px' }, _('时间')),
						E('th', { 'class': 'th', 'style': 'width:96px' }, _('事件')),
						E('th', { 'class': 'th', 'style': 'width:140px' }, _('MAC 地址')),
						E('th', { 'class': 'th', 'style': 'width:120px' }, _('IPv4 地址')),
						E('th', { 'class': 'th' }, _('主机名'))
					]),
					this.logBody
				])
			])
		]);
	},

	fill: function() {
		var rows = parseCSV(this.csvText);
		var names = aliasMap();
		var groups = groupRows(rows, names);
		var online = groups.filter(function(g) { return g.online; }).length;
		var unnamed = groups.filter(function(g) { return !g.alias; }).length;

		while (this.tbody.firstChild)
			this.tbody.removeChild(this.tbody.firstChild);

		groups.forEach(function(g) {
			var hostCell = [ g.host || '-' ];

			if (g.tag)
				hostCell.push(E('span', { 'style': 'color:var(--color-text-tertiary);margin-left:4px' }, g.tag));

			if (g.warn || g.multi)
				hostCell.push(E('span', {
					'style': 'color:#e67e22;margin-left:6px',
					'title': _('同一主机名当前有 %d 台同时在线，确定是多台设备').format(g.multi || 0)
				}, _('⚠ %d 台在线').format(g.multi || 0)));

			var macCell = [
				E('span', { 'class': 'ah-mono', 'title': g.macs.join('\n') }, g.macs[0] || '-')
			];

			if (g.macs.length > 1)
				macCell.push(E('span', { 'style': 'color:var(--color-text-tertiary);margin-left:4px' },
					_('等 %d 个').format(g.macs.length)));
			else if (g.random)
				macCell.push(E('span', {
					'style': 'color:var(--color-text-tertiary);margin-left:4px;font-size:11px',
					'title': _('手机随机生成的 MAC，不能用来识别设备')
				}, _('随机')));

			var inp = E('input', {
				'type': 'text',
				'class': 'ah-name',
				'style': 'width:100%;box-sizing:border-box',
				'placeholder': _('未命名'),
				'value': g.alias || '',
				'data-orig': g.alias || '',
				'data-macs': g.macs.join(' ')
			});

			inp.addEventListener('change', function() {
				var v = inp.value.trim();

				g.macs.forEach(function(m) { setAlias(m, v); });
				inp.setAttribute('data-orig', v);
			});

			var aliasCell = inp;

			this.tbody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, [
					E('span', {
						'style': 'display:inline-block;width:10px;height:10px;border-radius:50%;' +
							'background-color:' + (g.online ? '#28a745' : '#dc3545'),
						'title': g.online ? _('在线') : _('离线')
					})
				]),
				E('td', { 'class': 'td' }, aliasCell),
				E('td', { 'class': 'td' }, hostCell),
				E('td', { 'class': 'td ah-mono' }, g.ips.join(', ') || '-'),
				E('td', { 'class': 'td' }, macCell),
				E('td', { 'class': 'td' }, g.first || _('部署前')),
				E('td', { 'class': 'td' }, g.last || '-'),
				E('td', { 'class': 'td' }, String(g.count))
			]));
		}, this);

		if (!groups.length)
			this.tbody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'colspan': 8 }, E('em', {}, _('暂无记录，采集器启动后约 1 分钟出现数据')))
			]));

		this.summary.textContent = _('共 %d 台设备，当前在线 %d 台，未命名 %d 台')
			.format(groups.length, online, unnamed);

		this.notice.textContent = unnamed
			? _('提示：还有 %d 台设备没起别名。给同一个手机的不同 MAC 起相同的名字，它们会合并成一台。').format(unnamed)
			: _('所有设备都已命名。');

		while (this.logBody.firstChild)
			this.logBody.removeChild(this.logBody.firstChild);

		parseLog(this.logText).forEach(function(e) {
			var color = '#dc3545', label = _('离线');

			if (e.event === 'ONLINE') {
				color = '#28a745'; label = _('上线');
			}
			else if (e.event === 'REBOOT') {
				color = '#e67e22'; label = _('重启后重连');
			}

			this.logBody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, e.time),
				E('td', { 'class': 'td' }, [
					E('span', { 'style': 'color:' + color + ';font-weight:500' }, label)
				]),
				E('td', { 'class': 'td ah-mono' }, e.mac || '-'),
				E('td', { 'class': 'td ah-mono' }, e.ip || '-'),
				E('td', { 'class': 'td' }, (e.host && e.host !== '-') ? e.host : '-')
			]));
		}, this);

		if (!this.logBody.firstChild)
			this.logBody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'colspan': 5 }, E('em', {}, _('暂无上下线记录')))
			]));
	},

	handleSave: function() {
		return uci.save();
	},

	handleSaveApply: function(ev, mode) {
		var self = this;

		return uci.save()
			.then(function() { return uci.apply(); })
			.then(function() { window.location.reload(); });
	}
});
