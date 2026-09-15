#!/bin/bash
# 05-fix-ssr-plus.sh - 修复 SSR-Plus 节点的 nil 值报错

echo "[Fix SSR-Plus] Patching luci-app-ssr-plus for string.upper(nil) error..."

SSR_DIR="package/helloworld/luci-app-ssr-plus/luasrc/model/cbi/shadowsocksr"
if [ ! -d "$SSR_DIR" ]; then
    SSR_DIR="package/feeds/helloworld/luci-app-ssr-plus/luasrc/model/cbi/shadowsocksr"
fi
if [ ! -d "$SSR_DIR" ]; then
    SSR_DIR="feeds/helloworld/luci-app-ssr-plus/luasrc/model/cbi/shadowsocksr"
fi

if [ -d "$SSR_DIR" ]; then
    for lua_file in "$SSR_DIR/client.lua" "$SSR_DIR/advanced.lua"; do
        if [ -f "$lua_file" ]; then
            sed -i 's/string.upper(s.v2ray_protocol or s.type)/string.upper(s.v2ray_protocol or s.type or "UNKNOWN")/g' "$lua_file"
            echo "  -> Patched $lua_file"
        fi
    done
else
    echo "  -> SSR-Plus directory not found, skipping patch."
fi
