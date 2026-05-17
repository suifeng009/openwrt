#!/bin/bash
# 12-change-lan-cli.sh - 植入 SSH 终端一键交互式修改 LAN IP、网关与 DNS 的脚本

# 创建目标 bin 目录
mkdir -p package/base-files/files/usr/bin

# 写入终端修改工具 lan 到固件根文件系统
cat > package/base-files/files/usr/bin/lan << 'EOF'
#!/bin/sh
# lan - OpenWrt LAN IP, Gateway and DNS interactive editor (Busybox Ash compatible)

# 终端彩色配置
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==================================================${NC}"
echo -e "${GREEN}   🚀 OpenWrt 局域网 LAN IP/网关一键修改向导${NC}"
echo -e "${BLUE}==================================================${NC}"

# 获取当前配置
CUR_IP=$(uci -q get network.lan.ipaddr)
CUR_GW=$(uci -q get network.lan.gateway)
CUR_DNS=$(uci -q get network.lan.dns)

echo -e "${YELLOW}[当前网络配置]:${NC}"
echo -e "  1. LAN IP 地址  : ${GREEN}${CUR_IP:-未配置}${NC}"
echo -e "  2. 默认网关 IP  : ${GREEN}${CUR_GW:-未配置}${NC}"
echo -e "  3. DNS 服务器   : ${GREEN}${CUR_DNS:-未配置}${NC}"
echo -e "${BLUE}--------------------------------------------------${NC}"

# IP 格式校验函数 (兼容 BusyBox ash 轻量命令)
validate_ip() {
    local ip="$1"
    if echo "$ip" | grep -Eq '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'; then
        local q1=$(echo "$ip" | cut -d. -f1)
        local q2=$(echo "$ip" | cut -d. -f2)
        local q3=$(echo "$ip" | cut -d. -f3)
        local q4=$(echo "$ip" | cut -d. -f4)
        if [ "$q1" -le 255 ] && [ "$q2" -le 255 ] && [ "$q3" -le 255 ] && [ "$q4" -le 255 ]; then
            return 0
        fi
    fi
    return 1
}

# 1. 交互输入 LAN IP
while true; do
    printf "${YELLOW}👉 请输入新的 LAN IP 地址 [直接回车保留 $CUR_IP]: ${NC}"
    read NEW_IP
    if [ -z "$NEW_IP" ]; then
        NEW_IP="$CUR_IP"
        break
    fi
    if validate_ip "$NEW_IP"; then
        break
    else
        echo -e "${RED}❌ 输入格式错误！请输入合法的 IP 地址（例如: 192.168.1.1）${NC}"
    fi
done

# 2. 交互输入 默认网关
while true; do
    printf "${YELLOW}👉 请输入新的默认网关 IP [直接回车保留 ${CUR_GW:-未配置}, 输入 'none' 清空网关]: ${NC}"
    read NEW_GW
    if [ -z "$NEW_GW" ]; then
        NEW_GW="$CUR_GW"
        break
    fi
    if [ "$NEW_GW" = "none" ]; then
        NEW_GW=""
        break
    fi
    if validate_ip "$NEW_GW"; then
        break
    else
        echo -e "${RED}❌ 输入格式错误！请输入合法的 IP 地址，或者输入 'none' 清空${NC}"
    fi
done

# 3. 交互输入 DNS
while true; do
    printf "${YELLOW}👉 请输入新的 DNS 服务器 [直接回车保留 ${CUR_DNS:-未配置}, 输入 'none' 清空 DNS]: ${NC}"
    read NEW_DNS
    if [ -z "$NEW_DNS" ]; then
        NEW_DNS="$CUR_DNS"
        break
    fi
    if [ "$NEW_DNS" = "none" ]; then
        NEW_DNS=""
        break
    fi
    if validate_ip "$NEW_DNS"; then
        break
    else
        echo -e "${RED}❌ 输入格式错误！请输入合法的 IP 地址，或者输入 'none' 清空${NC}"
    fi
done

echo -e "${BLUE}--------------------------------------------------${NC}"
echo -e "${YELLOW}[即将应用的新配置清单]:${NC}"
echo -e "  LAN IP 地址 : ${GREEN}${NEW_IP:-[未配置/删除选项]}${NC}"
echo -e "  默认网关    : ${GREEN}${NEW_GW:-[未配置/删除选项]}${NC}"
echo -e "  DNS 服务器  : ${GREEN}${NEW_DNS:-[未配置/删除选项]}${NC}"
echo -e "${BLUE}--------------------------------------------------${NC}"

printf "${RED}❓ 确认是否将上述配置应用到路由器？(y/n, 默认 n): ${NC}"
read CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo -e "${YELLOW}操作已取消，配置未做任何改动。${NC}"
    exit 0
fi

# 应用配置到系统暂存区
if [ -n "$NEW_IP" ]; then
    uci set network.lan.ipaddr="$NEW_IP"
else
    uci delete network.lan.ipaddr 2>/dev/null
fi

if [ -n "$NEW_GW" ]; then
    uci set network.lan.gateway="$NEW_GW"
else
    uci delete network.lan.gateway 2>/dev/null
fi

if [ -n "$NEW_DNS" ]; then
    uci set network.lan.dns="$NEW_DNS"
else
    uci delete network.lan.dns 2>/dev/null
fi

# 写入生效
uci commit network

echo -e "${GREEN}✅ 系统网络配置（uci）已保存成功！${NC}"

printf "${YELLOW}❓ 是否立即重启网络服务使新 IP/网关立即生效？(y/n, 默认 y): ${NC}"
read RUN_RESTART
if [ "$RUN_RESTART" = "n" ] || [ "$RUN_RESTART" = "N" ]; then
    echo -e "${YELLOW}配置已写入，但尚未重启网络。您可以稍后手动执行: /etc/init.d/network restart${NC}"
    exit 0
fi

echo -e "${YELLOW}🔄 正在后台重启网络服务...${NC}"
echo -e "${RED}⚠️  注意：SSH 终端连接即将在此中断，请稍后使用新 IP 重新连接。${NC}"

# 后台重启网络，防止前端会话卡死导致进程残留
/etc/init.d/network restart >/dev/null 2>&1 &

echo -e "${BLUE}==================================================${NC}"
echo -e "${GREEN}   🎉 一键修改操作大成功！${NC}"
echo -e "  1. 路由器新管理后台地址 : ${YELLOW}http://${NEW_IP}${NC}"
echo -e "  2. 路由器新网段网关     : ${YELLOW}${NEW_IP}${NC}"
echo -e "${BLUE}--------------------------------------------------${NC}"
echo -e "${YELLOW}💡 温馨提示:${NC}"
echo -e "   如果您改变了网段（例如从 192.168.1.x 改为 192.168.5.x）："
echo -e "   请务必【重新插拔网线】或【断开并重新连接 Wi-Fi】"
echo -e "   以确保您的电脑/手机能够从 DHCP 服务重新获取到最新网段的 IP 地址！"
echo -e "${BLUE}==================================================${NC}"
EOF

# 赋予执行权限
chmod +x package/base-files/files/usr/bin/lan
echo "Successfully integrated 'lan' CLI script into package/base-files."
