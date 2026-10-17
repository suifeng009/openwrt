#
# luci-app-client-history - 客户端接入历史
#
# 记录每台设备的首次接入 / 最近接入 / 接入次数 / 当前在线状态。
# 数据来自 dnsmasq 租约表快照，不依赖 dnsmasq 日志（本固件 dnsmasq 不写 syslog）。
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-client-history
PKG_VERSION:=1.2.0
PKG_RELEASE:=1

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=BH5UOE

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-client-history
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI - 客户端接入历史
  DEPENDS:=+luci-base
  PKGARCH:=all
endef

define Package/luci-app-client-history/description
  记录局域网内每台设备的首次接入时间、最近接入时间、接入次数与在线状态。
  数据由 60 秒一次的 dnsmasq 租约表快照生成，重启与 sysupgrade 均保留，
  可用来排查「陌生设备什么时候连上来的」。
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Compile
endef

define Package/luci-app-client-history/install
	# LuCI 页面
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/client-history.js \
		$(1)/www/luci-static/resources/view/

	# 设备别名配置（/etc/config 默认随 sysupgrade 保留）
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/client-history $(1)/etc/config/client-history

	# 菜单与权限
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-client-history.json \
		$(1)/usr/share/luci/menu.d/
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-client-history.json \
		$(1)/usr/share/rpcd/acl.d/

	# 采集器与服务
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./root/usr/bin/client-history $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/client-history $(1)/etc/init.d/
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/98-client-history $(1)/etc/uci-defaults/

	# sysupgrade 保留数据
	$(INSTALL_DIR) $(1)/lib/upgrade/keep.d
	$(INSTALL_DATA) ./root/lib/upgrade/keep.d/client-history $(1)/lib/upgrade/keep.d/
endef

define Package/luci-app-client-history/conffiles
/etc/config/client-history
endef

define Package/luci-app-client-history/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
	[ -f /etc/uci-defaults/98-client-history ] && {
		( . /etc/uci-defaults/98-client-history ) && \
		rm -f /etc/uci-defaults/98-client-history
	}
	/etc/init.d/client-history enable 2>/dev/null
	/etc/init.d/client-history restart 2>/dev/null
}
exit 0
endef

$(eval $(call BuildPackage,luci-app-client-history))
