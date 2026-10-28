#!/bin/bash
# 06-adguardhome.sh - 集成 AdGuard Home（本体 + LuCI 内嵌面板入口）
#
# 设计原则（重要）：
#   1. 只安装 AdGuard Home 本体与菜单入口，不修改任何 DNS / DHCP / 防火墙配置；
#   2. 53 端口始终归 dnsmasq（及 OpenClash），AdGuard Home 默认不启用、不启动；
#   3. 不用 AdGuard Home 的人开机后没有任何额外进程与端口，上网行为完全不变；
#   4. 端口、上游 DNS、过滤规则全部由用户进入 AdGuard Home 面板后自行配置。
#
# 因此本脚本不会碰 network / dhcp / firewall 任何一个 uci 配置项，
# 也不会生成任何 AdGuard Home 的配置文件（首次启动由 AdGuard Home 自己生成）。

AGH_PKG="luci-app-adguardhome"
AGH_URL="https://github.com/AdguardTeam/AdGuardHome/releases/latest/download/AdGuardHome_linux_amd64.tar.gz"

src="$REPO_SRC/packages/$AGH_PKG"
dst="package/$AGH_PKG"

if [ ! -d "$src" ]; then
    echo "  -> WARNING: $src not found, skip AdGuard Home integration"
    return 0 2>/dev/null || exit 0
fi

# 1. 拷入本地包源码
rm -rf "$dst"
cp -r "$src" "$dst"
echo "  -> Copied local package: $AGH_PKG"

# 2. 预下载 AdGuard Home 核心（linux_amd64，与 x86_64 目标一致）
#    构建机与目标同为 amd64，解包后直接放入包内，随固件一起打包。
tmp_dir="$(mktemp -d)"
agh_ok=0

for attempt in 1 2 3; do
    echo "  -> Fetching AdGuard Home core (attempt $attempt)..."
    if curl -fL --connect-timeout 60 --retry 2 --retry-delay 5 \
        -o "$tmp_dir/agh.tar.gz" "$AGH_URL"; then
        if tar -xzf "$tmp_dir/agh.tar.gz" -C "$tmp_dir" >/dev/null 2>&1 \
            && [ -f "$tmp_dir/AdGuardHome/AdGuardHome" ]; then
            agh_ok=1
            break
        fi
    fi
    sleep 3
done

if [ "$agh_ok" = "1" ]; then
    mkdir -p "$dst/root/opt/AdGuardHome"
    cp "$tmp_dir/AdGuardHome/AdGuardHome" "$dst/root/opt/AdGuardHome/AdGuardHome"
    chmod +x "$dst/root/opt/AdGuardHome/AdGuardHome"
    agh_size="$(du -m "$dst/root/opt/AdGuardHome/AdGuardHome" 2>/dev/null | cut -f1)"
    echo "  -> AdGuard Home core ready (${agh_size:-?} MB)"
else
    echo "  -> WARNING: failed to fetch AdGuard Home core."
    echo "     Package will still build, just without /opt/AdGuardHome/AdGuardHome."
fi

rm -rf "$tmp_dir"

# 3. 写入 .config 启用本包（先去重，避免多次构建重复追加）
sed -i '/^CONFIG_PACKAGE_luci-app-adguardhome/d' .config
sed -i '/^# CONFIG_PACKAGE_luci-app-adguardhome is not set/d' .config
echo "CONFIG_PACKAGE_luci-app-adguardhome=y" >> .config
echo "  -> CONFIG_PACKAGE_luci-app-adguardhome=y"
