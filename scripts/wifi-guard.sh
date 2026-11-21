#!/bin/bash
# ============================================================
#  Intel 无线网卡 (iwlwifi) 支持自检守卫
#  scripts/wifi-guard.sh
#
#  为什么需要它（三个已经被验证过的坑）：
#   1. kmod-iwlwifi 的 DEPENDS 里有 @DRIVER_11AC_SUPPORT / @DRIVER_11AX_SUPPORT /
#      @DRIVER_11BE_SUPPORT，这三个开关定义在 hostapd/Config.in 且默认 n。
#      只要有一个没打开，make defconfig 会把 kmod-iwlwifi 整条静默丢弃，
#      结果就是「配置文件写着支持、系统里连 phy 都起不来」的假支持。
#   2. iwlwifi 驱动不依赖任何固件包，固件是一卡一 ucode 的独立包，
#      不显式选 = 卡插上去也加载不了。
#   3. 上游随时可能改包名/删包，写错的包名会被 defconfig 静默忽略。
#
#  本脚本做三件事：
#   A. 把 .config 里缺失的开关补写成 =y；
#   B. 重新跑一次 make defconfig —— 依赖没满足的项会在这一步真实消失；
#   C. 复验每个开关是否活下来，并核对固件包在上游源码里确实存在。
#  任何一项不通过就返回非 0：让失败红在配置阶段，而不是红在三小时之后。
#
#  用法： bash scripts/wifi-guard.sh [openwrt 源码目录，默认当前目录]
#  注意：必须在版本号注入之前调用 —— 本脚本会重跑 make defconfig，
#        而 defconfig 会把 CONFIG_VERSION_NUMBER 打回默认值。
# ============================================================
set -uo pipefail

SRC="${1:-.}"
cd "$SRC" 2>/dev/null || { echo "  [FAIL] 源码目录不存在: $SRC"; exit 1; }

say() { printf '%s\n' "$*"; }

say "==========================================================="
say " Intel 无线网卡支持自检 (wifi-guard)"
say " 源码目录: $(pwd)"
say "==========================================================="

if [ ! -f .config ]; then
  say "  [FAIL] 当前目录没有 .config，请先执行 make defconfig"
  exit 1
fi

# ---- 驱动 / 服务侧必须为 =y 的开关 ----
STACK_SYMS=(
  CONFIG_PACKAGE_kmod-mac80211
  CONFIG_PACKAGE_kmod-cfg80211
  CONFIG_PACKAGE_kmod-iwlwifi
  CONFIG_DRIVER_11AC_SUPPORT
  CONFIG_DRIVER_11AX_SUPPORT
  CONFIG_DRIVER_11BE_SUPPORT
  CONFIG_PACKAGE_wpad-openssl
  CONFIG_PACKAGE_wireless-regdb
  CONFIG_PACKAGE_iw
  CONFIG_PACKAGE_iwinfo
  CONFIG_PACKAGE_IWLWIFI_DEBUGFS
)

# ---- iwlwifi 固件包（一卡一 ucode，按芯片型号） ----
FW_SYMS=(
  CONFIG_PACKAGE_iwlwifi-firmware-iwl3160
  CONFIG_PACKAGE_iwlwifi-firmware-iwl3168
  CONFIG_PACKAGE_iwlwifi-firmware-iwl7260
  CONFIG_PACKAGE_iwlwifi-firmware-iwl7265
  CONFIG_PACKAGE_iwlwifi-firmware-iwl7265d
  CONFIG_PACKAGE_iwlwifi-firmware-iwl8260c
  CONFIG_PACKAGE_iwlwifi-firmware-iwl8265
  CONFIG_PACKAGE_iwlwifi-firmware-iwl9000
  CONFIG_PACKAGE_iwlwifi-firmware-iwl9260
  CONFIG_PACKAGE_iwlwifi-firmware-ax101
  CONFIG_PACKAGE_iwlwifi-firmware-ax200
  CONFIG_PACKAGE_iwlwifi-firmware-ax201
  CONFIG_PACKAGE_iwlwifi-firmware-ax210
  CONFIG_PACKAGE_iwlwifi-firmware-ax411
  CONFIG_PACKAGE_iwlwifi-firmware-be200
)

in_list() {
  local needle="$1" x
  shift
  for x in "$@"; do [ "$x" = "$needle" ] && return 0; done
  return 1
}

# ---- A. 补写缺失开关 ----
added=0
for s in "${STACK_SYMS[@]}" "${FW_SYMS[@]}"; do
  if grep -qxF "${s}=y" .config; then
    continue
  fi
  printf '%s=y\n' "$s" >> .config
  added=$((added + 1))
done
say "  [信息] 补写缺失开关: ${added} 项（已有: $(( ${#STACK_SYMS[@]} + ${#FW_SYMS[@]} - added )) 项）"

# ---- B. 重跑 defconfig 复验依赖 ----
if [ -f Makefile ] && command -v make >/dev/null 2>&1; then
  logf="$(mktemp)"
  say "  [信息] 重跑 make defconfig 复验依赖是否真的满足 ..."
  if make defconfig >"$logf" 2>&1; then
    say "  [ OK ] make defconfig 执行成功"
  else
    say "  [FAIL] make defconfig 执行失败，日志尾部："
    tail -n 40 "$logf" | sed 's/^/         /'
    rm -f "$logf"
    exit 1
  fi
  rm -f "$logf"
else
  say "  [WARN] 当前环境没有 make 或不是 OpenWrt 源码树，跳过 defconfig 复验（仅做静态核对）"
fi

# ---- C. 复验开关存活 ----
missing=()
for s in "${STACK_SYMS[@]}" "${FW_SYMS[@]}"; do
  grep -qxF "${s}=y" .config || missing+=("$s")
done

# ---- C2. 复验上游源码里真的存在这些包 ----
ghost=()
fwdir="package/firmware/linux-firmware"
for s in "${FW_SYMS[@]}"; do
  p="${s#CONFIG_PACKAGE_}"
  grep -rqF "Package/${p} " "$fwdir" 2>/dev/null || ghost+=("$p")
done

check_pkg() {
  local name="$1" file="$2" needle="$3"
  if [ ! -f "$file" ] || ! grep -qF "$needle" "$file"; then
    ghost+=("$name")
  fi
}
check_pkg "wpad-openssl"      "package/network/services/hostapd/Makefile" "define Package/wpad-openssl"
check_pkg "wireless-regdb"    "package/firmware/wireless-regdb/Makefile"   "define Package/wireless-regdb"
check_pkg "iw"                "package/network/utils/iw/Makefile"           "define Package/iw"
check_pkg "iwinfo"            "package/network/utils/iwinfo/Makefile"       "define Package/iwinfo"

# ---- 结果面板 ----
say ""
say "-----------------------------------------------------------"
say " 配置项核对结果"
say "-----------------------------------------------------------"
for s in "${STACK_SYMS[@]}" "${FW_SYMS[@]}"; do
  p="${s#CONFIG_PACKAGE_}"
  if in_list "$s" "${missing[@]+"${missing[@]}"}" || in_list "$p" "${ghost[@]+"${ghost[@]}"}"; then
    printf '  [FAIL] %s\n' "$s"
  else
    printf '  [ OK ] %s\n' "$s"
  fi
done

fail=0
if [ "${#missing[@]}" -gt 0 ]; then
  fail=1
  say ""
  say "  ❌ 以下开关在 make defconfig 之后被丢弃，说明依赖没满足："
  for s in "${missing[@]}"; do say "     - $s"; done
  say ""
  say "  排障方向："
  say "   - kmod-iwlwifi 被丢 → 检查 CONFIG_DRIVER_11AC_SUPPORT / 11AX / 11BE 是否 =y，"
  say "     以及 PCI_SUPPORT 是否可用（x86 平台默认有）。"
  say "   - wpad-openssl 被丢 → 是否与其它 hostapd provider 冲突（CONFLICTS 只能留一个）。"
  say "   - 固件包被丢   → 上游可能改包名，先用 grep 在 package/firmware/linux-firmware 里找真实名字。"
fi

if [ "${#ghost[@]}" -gt 0 ]; then
  fail=1
  say ""
  say "  ❌ 以下名字在上游源码里不存在（会被 defconfig 静默忽略）："
  for g in "${ghost[@]}"; do say "     - $g"; done
  say "   → 请对照 package/firmware/linux-firmware/*.mk 与 hostapd/Makefile 校正包名。"
fi

say ""
if [ "$fail" -eq 0 ]; then
  say "  ✅ 通过：${#STACK_SYMS[@]} 项驱动/服务开关 + ${#FW_SYMS[@]} 个 iwlwifi 固件包全部生效。"
  say "     固件内应能看到 /lib/firmware/iwlwifi-*.ucode 与 /usr/sbin/wpad。"
else
  say "  💥 未通过：Intel 无线网卡支持配置不完整，编译继续下去只会产出一个假支持固件。"
fi

exit "$fail"
