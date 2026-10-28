#
# luci-app-adguardhome - AdGuard Home 集成（本体 + LuCI 内嵌面板入口）
#
# 设计原则：
#   1. 本包只负责「安装 AdGuard Home 本体」与「提供一个菜单入口」；
#   2. 不修改任何 DNS / DHCP / 防火墙配置，53 端口始终归 dnsmasq（及 OpenClash）；
#   3. 服务默认不启用、不启动，不用它的人开机后没有任何额外进程与端口；
#   4. 端口、上游 DNS、过滤规则全部由用户在 AdGuard Home 面板内自行配置。
#
# 二进制不入库：由 diy-part2.d/06-adguardhome.sh 在构建时从 GitHub Releases 拉取
# AdGuardHome_linux_amd64.tar.gz 放到 root/opt/AdGuardHome/AdGuardHome。
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-adguardhome
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=BH5UOE

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-adguardhome
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI - AdGuard Home 面板入口
  DEPENDS:=+luci-base
  PKGARCH:=all
endef

define Package/luci-app-adguardhome/description
  集成 AdGuard Home 服务本体，并在「服务」菜单中提供一个内嵌面板入口。

  部署路径（x86_64）：
    - 核心：/opt/AdGuardHome/AdGuardHome
    - 配置：/opt/AdGuardHome/AdGuardHome.yaml（sysupgrade 保留）
    - 数据：/opt/AdGuardHome/data（sysupgrade 保留）

  本包刻意保持「零预设」：
    - 服务默认不启用、不启动，不用它的人开机后无额外进程、无额外端口；
    - 不接管 53 端口，不写入任何 dnsmasq / OpenClash / DHCP / 防火墙配置；
    - 端口、上游服务器、过滤规则全部由用户进入 AdGuard Home 面板后自行设置。

  二进制由构建脚本自动从 GitHub Releases 拉取（linux_amd64），
  拉取失败时本包仍可正常打包，只是不带核心，可在系统内手动放置。
endef

define Package/luci-app-adguardhome/install
	# AdGuard Home 核心二进制（构建时预下载，缺失时跳过但不中断打包）
	# 安装路径与现有部署保持一致：/opt/AdGuardHome/AdGuardHome
	$(INSTALL_DIR) $(1)/opt/AdGuardHome
	if [ -f ./root/opt/AdGuardHome/AdGuardHome ]; then \
		$(INSTALL_BIN) ./root/opt/AdGuardHome/AdGuardHome $(1)/opt/AdGuardHome/AdGuardHome; \
	else \
		echo "WARNING: root/opt/AdGuardHome/AdGuardHome missing, packaging without core"; \
	fi

	# LuCI 内嵌面板视图
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/adguardhome.js \
		$(1)/www/luci-static/resources/view/adguardhome.js

	# 服务控制配置
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/adguardhome $(1)/etc/config/adguardhome

	# 菜单与权限
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-adguardhome.json \
		$(1)/usr/share/luci/menu.d/luci-app-adguardhome.json
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-adguardhome.json \
		$(1)/usr/share/rpcd/acl.d/luci-app-adguardhome.json

	# 服务脚本
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/adguardhome $(1)/etc/init.d/adguardhome

	# 首次开机初始化
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/95-adguardhome $(1)/etc/uci-defaults/95-adguardhome

	# sysupgrade 保留数据
	$(INSTALL_DIR) $(1)/lib/upgrade/keep.d
	$(INSTALL_DATA) ./root/lib/upgrade/keep.d/adguardhome $(1)/lib/upgrade/keep.d/adguardhome
endef

define Package/luci-app-adguardhome/conffiles
/etc/config/adguardhome
endef

define Package/luci-app-adguardhome/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
	[ -f /etc/uci-defaults/95-adguardhome ] && {
		( . /etc/uci-defaults/95-adguardhome ) && \
		rm -f /etc/uci-defaults/95-adguardhome
	}
}
exit 0
endef

$(eval $(call BuildPackage,luci-app-adguardhome))
