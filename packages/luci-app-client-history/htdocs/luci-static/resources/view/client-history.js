'use strict';
'require view';
'require fs';
'require poll';

var CSV_PATH = '/root/client-history.csv';
var LOG_PATH = '/root/client-history.log';
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

function sortRows(rows) {
	return rows.sort(function(a, b) {
		var ao = (a.online === '1') ? 0 : 1;
		var bo = (b.online === '1') ? 0 : 1;

		if (ao !== bo)
			return ao - bo;

		return String(b.last_online || '').localeCompare(String(a.last_online || ''));
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fs.read(CSV_PATH), ''),
			L.resolveDefault(fs.read(LOG_PATH), '')
		]);
	},

	render: function(data) {
		var self = this;

		this.tbody = E('tbody');
		this.logBody = E('tbody');
		this.summary = E('p', { 'class': 'cbi-section-descr' });

		this.fill(data[0], data[1]);

		poll.add(function() {
			return Promise.all([
				L.resolveDefault(fs.read(CSV_PATH), ''),
				L.resolveDefault(fs.read(LOG_PATH), '')
			]).then(function(d) {
				self.fill(d[0], d[1]);
			});
		}, 30);

		return E('div', {}, [
			E('h2', {}, _('客户端接入历史')),
			E('div', { 'class': 'cbi-section' }, [
				E('p', {},
					_('记录每台设备的首次接入、最近接入与接入次数。数据由 60 秒一次的 DHCP 租约快照生成，' +
					  '重启设备、sysupgrade 保留配置升级都不会丢。')),
				E('p', { 'class': 'cbi-section-descr' },
					_('「首次接入」显示「部署前」表示这台设备在插件安装前就已经在线，真实接入时间没有记录；' +
					  '手机开启「随机 MAC」时每次重连可能被当成一台新设备。')),
				this.summary,
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, _('状态')),
						E('th', { 'class': 'th' }, _('主机名')),
						E('th', { 'class': 'th' }, _('IPv4 地址')),
						E('th', { 'class': 'th' }, _('MAC 地址')),
						E('th', { 'class': 'th' }, _('首次接入')),
						E('th', { 'class': 'th' }, _('最近接入')),
						E('th', { 'class': 'th' }, _('接入次数'))
					]),
					this.tbody
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('最近上下线记录')),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, _('时间')),
						E('th', { 'class': 'th' }, _('事件')),
						E('th', { 'class': 'th' }, _('MAC 地址')),
						E('th', { 'class': 'th' }, _('IPv4 地址')),
						E('th', { 'class': 'th' }, _('主机名'))
					]),
					this.logBody
				])
			])
		]);
	},

	fill: function(csvText, logText) {
		var rows = sortRows(parseCSV(csvText));
		var online = 0;

		while (this.tbody.firstChild)
			this.tbody.removeChild(this.tbody.firstChild);

		rows.forEach(function(r) {
			var isOn = (r.online === '1');

			if (isOn)
				online++;

			this.tbody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, [
					E('span', {
						'style': 'display:inline-block;width:10px;height:10px;border-radius:50%;' +
							'background-color:' + (isOn ? '#28a745' : '#dc3545'),
						'role': 'img',
						'aria-label': isOn ? _('在线') : _('离线'),
						'title': isOn ? _('在线') : _('离线')
					})
				]),
				E('td', { 'class': 'td' }, (r.hostname && r.hostname !== '-') ? r.hostname : '-'),
				E('td', { 'class': 'td' }, r.ip || '-'),
				E('td', { 'class': 'td' }, r.mac || '-'),
				E('td', { 'class': 'td' }, (r.first_seen === '-' || !r.first_seen) ? _('部署前') : r.first_seen),
				E('td', { 'class': 'td' }, r.last_online || '-'),
				E('td', { 'class': 'td' }, r.count || '0')
			]));
		}, this);

		if (!rows.length)
			this.tbody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'colspan': 7 }, E('em', {}, _('暂无记录，采集器启动后约 1 分钟出现数据')))
			]));

		this.summary.textContent = _('共 %d 台设备，当前在线 %d 台').format(rows.length, online);

		while (this.logBody.firstChild)
			this.logBody.removeChild(this.logBody.firstChild);

		parseLog(logText).forEach(function(e) {
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
					E('span', {
						'style': 'color:' + color + ';font-weight:bold'
					}, label)
				]),
				E('td', { 'class': 'td' }, e.mac || '-'),
				E('td', { 'class': 'td' }, e.ip || '-'),
				E('td', { 'class': 'td' }, (e.host && e.host !== '-') ? e.host : '-')
			]));
		}, this);

		if (!this.logBody.firstChild)
			this.logBody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'colspan': 5 }, E('em', {}, _('暂无上下线记录')))
			]));
	}
});
