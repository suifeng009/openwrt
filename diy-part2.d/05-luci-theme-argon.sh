#!/bin/bash
# 05-luci-theme-argon.sh - 保证 Argon 始终是 LuCI 的默认主题
#
# 上游 LuCI 自 23.05 起重构了主题机制（25.12 沿用），主题由两处 UCI 共同决定：
#   1) luci.main.mediaurlbase   —— 真正决定渲染哪一套主题模板
#   2) luci.themes.<名称>       —— 主题注册表，决定「系统 → 语言和界面 → 设计」下拉框里能选到什么
# 这两项过去只在主题包自带的 /etc/uci-defaults/30_luci-theme-<名称> 首次启动时写入，
# 该脚本带有「注册项已存在就跳过」与 PKG_UPGRADE 保护；一旦配置里缺了注册项，
# 或升级保留配置后注册项与新主题对不上，luci-base 出厂自带的 bootstrap 就会顶上来，
# 表现就是「Argon 不再是默认主题」。
#
# 因此这里做两层保险：
#   1. 编译期直接改掉 luci-base 出厂 /etc/config/luci 的默认值与注册表；
#   2. 首次启动 / 升级后首启时再用一个幂等的 uci-defaults 兜底纠正。

ARGON_URL='/luci-static/argon'
LUCI_CONFIG='feeds/luci/modules/luci-base/root/etc/config/luci'

# ── 1. 编译期：把 LuCI 出厂配置的默认主题直接写成 Argon ──────────────────────
if [ -f "$LUCI_CONFIG" ]; then
    if grep -q "option Argon" "$LUCI_CONFIG"; then
        echo "  -> luci-base 出厂配置已包含 Argon 注册项，跳过改写"
    else
        # mediaurlbase 改写为 argon，并在 "config internal themes" 段落里登记 Argon
        awk -v url="$ARGON_URL" '
            /^[ \t]*option[ \t]+mediaurlbase[ \t]/ {
                print "\toption mediaurlbase \047" url "\047"
                next
            }
            /^config internal[ \t]+\047?themes\047?[ \t]*$/ {
                print
                print "\toption Argon \047" url "\047"
                next
            }
            { print }
        ' "$LUCI_CONFIG" > "${LUCI_CONFIG}.tmp" && mv "${LUCI_CONFIG}.tmp" "$LUCI_CONFIG"
        echo "  -> luci-base 出厂默认主题已改为 Argon ($ARGON_URL)"
    fi
else
    echo "  -> Warning: 未找到 $LUCI_CONFIG，跳过出厂默认主题改写"
fi

# ── 2. 运行期：首启/升级首启时幂等纠正（兜住第 1 步失效或配置被保留的情况）──
UCI_DEFAULTS_DIR='package/base-files/files/etc/uci-defaults'
mkdir -p "$UCI_DEFAULTS_DIR"

cat > "$UCI_DEFAULTS_DIR/99-luci-theme-argon" << 'EOF'
#!/bin/sh
# 99-luci-theme-argon - 保证 Argon 为默认主题
#
# 仅在「Argon 已安装」且「当前主题仍是出厂 bootstrap 默认值」时纠正，
# 不会覆盖用户在设计页面里主动选择的其它主题。脚本名排在
# 30_luci-theme-* 之后执行，因此总能覆盖主题包自身的注册结果。

ARGON_URL='/luci-static/argon'

[ -d /www/luci-static/argon ] || exit 0

# 新 LuCI 的「设计」下拉框只列 luci.themes.* 里注册过的主题
uci -q get luci.themes.Argon >/dev/null 2>&1 || uci -q set luci.themes.Argon="$ARGON_URL"

case "$(uci -q get luci.main.mediaurlbase)" in
	''|/luci-static/bootstrap|/luci-static/bootstrap-light|/luci-static/bootstrap-dark)
		uci -q set luci.main.mediaurlbase="$ARGON_URL"
		;;
esac

uci -q commit luci
exit 0
EOF
chmod +x "$UCI_DEFAULTS_DIR/99-luci-theme-argon"

echo "  -> 已注入 /etc/uci-defaults/99-luci-theme-argon"
