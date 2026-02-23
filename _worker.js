// Cloudflare Worker - 节点混合生成与优选工具 (iOS 26 风格 & 终极全客户端自适应版)
// 包含全协议自适应生成、外部节点导入替换、多源提取及所有指定客户端的单独订阅

// 默认配置
let customPreferredIPs = [];
let customPreferredDomains = [];
let epd = true;  // 启用优选域名
let epi = true;  // 启用优选IP
let egi = true;  // 启用GitHub优选
let ev = true;   // 启用VLESS协议
let et = false;  // 启用Trojan协议
let vm = false;  // 启用VMess协议
let scu = 'https://url.v1.mk/sub';  // 订阅转换地址 (外部转换器)
let enableECH = false;
let customDNS = 'https://dns.joeyblog.eu.org/joeyblog';
let customECHDomain = 'cloudflare-ech.com';

// 默认优选域名列表
const directDomains = [
    { name: "cloudflare.182682.xyz", domain: "cloudflare.182682.xyz" },
    { domain: "freeyx.cloudflare88.eu.org" },
    { domain: "bestcf.top" },
    { domain: "cdn.2020111.xyz" },
    { domain: "cf.0sm.com" },
    { domain: "cf.090227.xyz" },
    { domain: "cf.zhetengsha.eu.org" },
    { domain: "cfip.1323123.xyz" },
    { domain: "cloudflare-ip.mofashi.ltd" },
    { domain: "cf.877771.xyz" },
    { domain: "xn--b6gac.eu.org" }
];

// 默认优选IP来源URL
const defaultIPURL = 'https://raw.githubusercontent.com/qwer-search/bestip/refs/heads/main/kejilandbestip.txt';

function isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

function extractUrls(str) {
    if (!str) return [];
    return str.split(/[\r\n]+/).map(s => s.trim()).filter(s => s.startsWith('http://') || s.startsWith('https://'));
}

// ===================== 数据获取函数 =====================

async function fetchDynamicIPs(ipv4Enabled = true, ipv6Enabled = true, ispMobile = true, ispUnicom = true, ispTelecom = true) {
    const v4Url = "https://www.wetest.vip/page/cloudflare/address_v4.html";
    const v6Url = "https://www.wetest.vip/page/cloudflare/address_v6.html";
    let results = [];
    try {
        const fetchPromises = [];
        if (ipv4Enabled) fetchPromises.push(fetchAndParseWetest(v4Url));
        else fetchPromises.push(Promise.resolve([]));
        
        if (ipv6Enabled) fetchPromises.push(fetchAndParseWetest(v6Url));
        else fetchPromises.push(Promise.resolve([]));

        const [ipv4List, ipv6List] = await Promise.all(fetchPromises);
        results = [...ipv4List, ...ipv6List];
        
        if (results.length > 0) {
            results = results.filter(item => {
                const isp = item.isp || '';
                if (isp.includes('移动') && !ispMobile) return false;
                if (isp.includes('联通') && !ispUnicom) return false;
                if (isp.includes('电信') && !ispTelecom) return false;
                return true;
            });
        }
        return results.length > 0 ? results : [];
    } catch (e) {
        return [];
    }
}

async function fetchAndParseWetest(url) {
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) return [];
        const html = await response.text();
        const results = [];
        const rowRegex = /<tr[\s\S]*?<\/tr>/g;
        const cellRegex = /<td data-label="线路名称">(.+?)<\/td>[\s\S]*?<td data-label="优选地址">([\d.:a-fA-F]+)<\/td>[\s\S]*?<td data-label="数据中心">(.+?)<\/td>/;

        let match;
        while ((match = rowRegex.exec(html)) !== null) {
            const rowHtml = match[0];
            const cellMatch = rowHtml.match(cellRegex);
            if (cellMatch && cellMatch[1] && cellMatch[2]) {
                const colo = cellMatch[3] ? cellMatch[3].trim().replace(/<.*?>/g, '') : '';
                results.push({
                    isp: cellMatch[1].trim().replace(/<.*?>/g, ''),
                    ip: cellMatch[2].trim(),
                    colo: colo
                });
            }
        }
        return results;
    } catch (error) {
        return [];
    }
}

async function 请求优选API(urls, 默认端口 = '443', 超时时间 = 3000) {
    if (!urls?.length) return [];
    const results = new Set();
    await Promise.allSettled(urls.map(async (url) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 超时时间);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            let text = await response.text();
            if (!text || text.trim().length === 0) return;
            
            const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
            const isCSV = lines.length > 1 && lines[0].includes(',');
            const IPV6_PATTERN = /^[^\[\]]*:[^\[\]]*:[^\[\]]/;
            
            if (!isCSV) {
                lines.forEach(line => {
                    const hashIndex = line.indexOf('#');
                    const [hostPart, remark] = hashIndex > -1 ? [line.substring(0, hashIndex), line.substring(hashIndex)] : [line, ''];
                    let hasPort = false;
                    if (hostPart.startsWith('[')) {
                        hasPort = /\]:(\d+)$/.test(hostPart);
                    } else {
                        const colonIndex = hostPart.lastIndexOf(':');
                        hasPort = colonIndex > -1 && /^\d+$/.test(hostPart.substring(colonIndex + 1));
                    }
                    const port = new URL(url).searchParams.get('port') || 默认端口;
                    results.add(hasPort ? line : `${hostPart}:${port}${remark}`);
                });
            } else {
                const headers = lines[0].split(',').map(h => h.trim());
                const dataLines = lines.slice(1);
                const ipIdx = headers.findIndex(h => h.includes('IP'));
                const portIdx = headers.findIndex(h => h.includes('端口')) > -1 ? headers.findIndex(h => h.includes('端口')) : -1;
                const remarkIdx = headers.findIndex(h => h.includes('国家') || h.includes('城市') || h.includes('中心') || h.includes('延迟'));
                
                dataLines.forEach(line => {
                    const cols = line.split(',').map(c => c.trim());
                    if (ipIdx === -1 || !cols[ipIdx]) return;
                    const wrappedIP = IPV6_PATTERN.test(cols[ipIdx]) ? `[${cols[ipIdx]}]` : cols[ipIdx];
                    const port = portIdx > -1 ? cols[portIdx] : (new URL(url).searchParams.get('port') || 默认端口);
                    const remark = remarkIdx > -1 ? cols[remarkIdx] : 'CF Node';
                    results.add(`${wrappedIP}:${port}#${remark}`);
                });
            }
        } catch (e) { }
    }));
    return Array.from(results);
}

async function fetchCustomDomains(urls) {
    if (!urls || urls.length === 0) return [];
    let domains = [];
    await Promise.allSettled(urls.map(async (url) => {
        try {
            const resp = await fetch(url);
            const text = await resp.text();
            const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.includes('://'));
            lines.forEach(line => {
                const parts = line.split(/[#,]/);
                domains.push({ domain: parts[0].trim(), name: parts[1] ? parts[1].trim() : parts[0].trim() });
            });
        } catch (e) { }
    }));
    return domains;
}

function parseIPStringList(ipStrings) {
    return ipStrings.map(raw => {
        const regex = /^(\[[\da-fA-F:]+\]|[\d.]+|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*)(?::(\d+))?(?:#(.+))?$/;
        const match = raw.match(regex);
        if (match) {
            return {
                ip: match[1].replace(/[\[\]]/g, ''),
                port: parseInt(match[2] || 443),
                name: match[3] || match[1],
                isp: match[3] || '优选'
            };
        }
        return null;
    }).filter(item => item !== null);
}

// ===================== 外部节点解析与替换核心 =====================

async function parseImportedNodesContent(content) {
    if (!content) return [];
    let text = content;
    if (!content.includes('://') && /^[A-Za-z0-9+/=\s]+$/.test(content)) {
        try { text = atob(content); } catch (e) {}
    }
    return text.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.startsWith('vless://') || l.startsWith('trojan://') || l.startsWith('vmess://'));
}

function replaceNodeAddresses(nodes, optimalList, disableNonTLS) {
    const results = [];
    nodes.forEach(nodeLink => {
        let proto = nodeLink.split('://')[0];
        let isTLS = false;
        let parsedVmess = null;
        let parsedUrl = null;

        if (proto === 'vmess') {
            try {
                const b64 = nodeLink.slice(8);
                parsedVmess = JSON.parse(decodeURIComponent(escape(atob(b64))));
                isTLS = (parsedVmess.tls === 'tls');
            } catch (e) { return; }
        } else {
            try {
                parsedUrl = new URL(nodeLink);
                let params = new URLSearchParams(parsedUrl.search);
                isTLS = (params.get('security') === 'tls');
            } catch (e) { return; }
        }

        if (disableNonTLS && !isTLS) return;

        optimalList.forEach(opt => {
            const ip = opt.ip || opt.domain;
            if (!ip) return;
            const port = opt.port ? opt.port.toString() : (proto === 'vmess' ? parsedVmess.port : parsedUrl.port);
            const remarkExt = opt.name || opt.isp || ip;

            if (proto === 'vmess') {
                let newNode = JSON.parse(JSON.stringify(parsedVmess));
                newNode.add = ip;
                newNode.port = port;
                newNode.ps = `${newNode.ps} - ${remarkExt}`;
                const jsonStr = JSON.stringify(newNode);
                const vmessBase64 = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g,
                    function toSolidBytes(match, p1) { return String.fromCharCode('0x' + p1); }));
                results.push(`vmess://${vmessBase64}`);
            } else {
                let urlObj = new URL(nodeLink);
                urlObj.hostname = ip.includes(':') ? `[${ip}]` : ip;
                if (port) urlObj.port = port;
                let oldHash = decodeURIComponent(urlObj.hash.slice(1) || proto);
                urlObj.hash = encodeURIComponent(`${oldHash} - ${remarkExt}`);
                results.push(urlObj.toString());
            }
        });
    });
    return results;
}

// ===================== 生成节点配置核心 =====================

function generateLinksFromSource(list, user, workerDomain, disableNonTLS = false, customPath = '/', echConfig = null) {
    const CF_HTTP_PORTS = [80, 8080, 8880, 2052, 2082, 2086, 2095];
    const CF_HTTPS_PORTS = [443, 2053, 2083, 2087, 2096, 8443];
    const links = [];
    const wsPath = customPath || '/';

    list.forEach(item => {
        let nodeNameBase = item.isp ? item.isp.replace(/\s/g, '_') : (item.name || item.domain || item.ip);
        if (item.colo && item.colo.trim()) nodeNameBase = `${nodeNameBase}-${item.colo.trim()}`;
        const safeIP = (item.ip && item.ip.includes(':')) ? `[${item.ip}]` : (item.ip || item.domain);
        
        let portsToGenerate = [];
        if (item.port) {
            const port = parseInt(item.port);
            if (CF_HTTPS_PORTS.includes(port)) portsToGenerate.push({ port: port, tls: true });
            else if (CF_HTTP_PORTS.includes(port) && !disableNonTLS) portsToGenerate.push({ port: port, tls: false });
            else portsToGenerate.push({ port: port, tls: true });
        } else {
            [443].forEach(port => portsToGenerate.push({ port: port, tls: true }));
            if (!disableNonTLS) [80].forEach(port => portsToGenerate.push({ port: port, tls: false }));
        }

        portsToGenerate.forEach(({ port, tls }) => {
            const wsNodeName = tls ? `${nodeNameBase}-${port}-WS-TLS` : `${nodeNameBase}-${port}-WS`;
            const wsParams = new URLSearchParams({ 
                encryption: 'none', 
                security: tls ? 'tls' : 'none', 
                type: 'ws', 
                host: workerDomain, 
                path: wsPath
            });
            if (tls) {
                wsParams.set('sni', workerDomain);
                wsParams.set('fp', 'chrome');
                if (echConfig) {
                    wsParams.set('alpn', 'h3,h2,http/1.1');
                    wsParams.set('ech', echConfig);
                }
            }
            links.push(`vless://${user}@${safeIP}:${port}?${wsParams.toString()}#${encodeURIComponent(wsNodeName)}`);
        });
    });
    return links;
}

// ===================== 自建客户端配置生成函数 =====================

function generateClashConfig(links) {
    let yaml = 'port: 7890\nsocks-port: 7891\nallow-lan: false\nmode: rule\nlog-level: info\n\nproxies:\n';
    const proxyNames = [];
    links.forEach((link, index) => {
        const name = decodeURIComponent(link.split('#')[1] || `节点${index + 1}`);
        proxyNames.push(name);
        if (link.startsWith('vless://')) {
            const server = link.match(/@([^:]+):(\d+)/)?.[1] || '';
            const port = link.match(/@[^:]+:(\d+)/)?.[1] || '443';
            const uuid = link.match(/vless:\/\/([^@]+)@/)?.[1] || '';
            const tls = link.includes('security=tls');
            const path = link.match(/path=([^&#]+)/)?.[1] || '/';
            const host = link.match(/host=([^&#]+)/)?.[1] || '';
            const sni = link.match(/sni=([^&#]+)/)?.[1] || '';
            const echParam = link.match(/[?&]ech=([^&#]+)/)?.[1];
            
            yaml += `  - name: "${name}"\n    type: vless\n    server: ${server}\n    port: ${port}\n    uuid: ${uuid}\n    tls: ${tls}\n    network: ws\n    ws-opts:\n      path: "${path}"\n      headers:\n        Host: ${host}\n`;
            if (sni) yaml += `    servername: ${sni}\n`;
            if (echParam) yaml += `    client-fingerprint: chrome\n`;
        }
    });
    yaml += '\nproxy-groups:\n  - name: PROXY\n    type: select\n    proxies: [' + proxyNames.map(n => `"${n}"`).join(', ') + ']\nrules:\n  - MATCH,PROXY\n';
    return yaml;
}

function generateSurgeConfig(links) {
    let config = '[Proxy]\n';
    const names = [];
    links.forEach((link, i) => {
        if(link.startsWith('vless://')) {
            const name = decodeURIComponent(link.split('#')[1] || `节点${i + 1}`);
            names.push(name);
            config += `${name} = vless, ${link.match(/@([^:]+):(\d+)/)?.[1] || ''}, ${link.match(/@[^:]+:(\d+)/)?.[1] || '443'}, username=${link.match(/vless:\/\/([^@]+)@/)?.[1] || ''}, tls=${link.includes('security=tls')}, ws=true, ws-path=${link.match(/path=([^&#]+)/)?.[1] || '/'}, ws-headers=Host:${link.match(/host=([^&#]+)/)?.[1] || ''}\n`;
        }
    });
    config += '\n[Proxy Group]\nPROXY = select, ' + names.join(', ') + '\n';
    return config;
}

function generateQuantumultConfig(links) {
    let qxConfig = '';
    links.forEach(link => { qxConfig += link + '\n'; });
    return btoa(qxConfig);
}

// ===================== 主订阅处理函数 =====================

async function handleSubscriptionRequest(request, user, customDomain, configs) {
    const url = new URL(request.url);
    const workerDomain = url.hostname;
    const nodeDomain = customDomain || url.hostname;
    let target = url.searchParams.get('target') || 'base64';
    
    // Auto 模式下侦测 User-Agent 下发自建配置
    if (target === 'auto') {
        const ua = request.headers.get('User-Agent')?.toLowerCase() || '';
        // 自动分发逻辑涵盖 Clash、Surge、QuanX 等，如果都不匹配则下发纯 Base64 (V2Ray/Nekoray/Shadowrocket 等通用格式)
        if (ua.includes('clash') || ua.includes('stash') || ua.includes('meta')) target = 'clash';
        else if (ua.includes('surge')) target = 'surge';
        else if (ua.includes('quantumult')) target = 'quanx';
        else target = 'base64'; 
    }
    
    const finalLinks = [];
    let optimalPool = [];
    
    // 1. 获取优选域名
    if (configs.epd) {
        let domains = [...directDomains];
        if (configs.customDomainUrls && configs.customDomainUrls.length > 0) {
            domains = domains.concat(await fetchCustomDomains(configs.customDomainUrls));
        }
        domains.forEach(d => optimalPool.push({ ip: d.domain, isp: d.name || d.domain, isDomain: true }));
    }

    // 2. 获取优选IP
    if (configs.epi) {
        optimalPool = optimalPool.concat(await fetchDynamicIPs(configs.ipv4, configs.ipv6, configs.ispMobile, configs.ispUnicom, configs.ispTelecom));
    }
    
    // 3. 获取自定义/API优选IP
    if (configs.egi) {
        let ipUrls = [];
        if (configs.piu) ipUrls.push(configs.piu);
        if (configs.customIpUrls && configs.customIpUrls.length > 0) {
            ipUrls = ipUrls.concat(configs.customIpUrls);
        }
        if (ipUrls.length > 0) {
            optimalPool = optimalPool.concat(parseIPStringList(await 请求优选API(ipUrls)));
        }
    }

    // 限制IP数量为30
    const pureIPs = optimalPool.filter(x => !x.isDomain).slice(0, 30);
    const pureDomains = optimalPool.filter(x => x.isDomain);
    optimalPool = [...pureDomains, ...pureIPs];

    // 判断模式
    let importedNodesList = [];
    if (configs.importSubUrl) {
        try { importedNodesList = importedNodesList.concat(await parseImportedNodesContent(await (await fetch(configs.importSubUrl)).text())); } catch (e) {}
    }
    if (configs.importNodesText) {
        importedNodesList = importedNodesList.concat(await parseImportedNodesContent(configs.importNodesText));
    }

    if (importedNodesList.length > 0) {
        if (optimalPool.length === 0) optimalPool = [{ ip: workerDomain, isp: '原生地址' }];
        finalLinks.push(...replaceNodeAddresses(importedNodesList, optimalPool, configs.disableNonTLS));
    } else {
        if (optimalPool.length === 0) optimalPool = [{ ip: workerDomain, isp: '原生地址' }];
        if (configs.evEnabled) {
            finalLinks.push(...generateLinksFromSource(optimalPool, user, nodeDomain, configs.disableNonTLS, configs.customPath, configs.echConfig));
        }
    }

    if (finalLinks.length === 0) finalLinks.push(`vless://00000000-0000-0000-0000-000000000000@127.0.0.1:80?encryption=none&security=none&type=ws&host=error.com&path=%2F#${encodeURIComponent("节点处理失败")}`);

    // 输出格式分发
    let subscriptionContent;
    let contentType = 'text/plain; charset=utf-8';
    
    switch (target.toLowerCase()) {
        case 'clash':
        case 'clashr':
        case 'stash':
            subscriptionContent = generateClashConfig(finalLinks);
            contentType = 'text/yaml; charset=utf-8';
            break;
        case 'surge':
        case 'surge2':
        case 'surge3':
        case 'surge4':
            subscriptionContent = generateSurgeConfig(finalLinks);
            break;
        case 'quanx':
        case 'quantumult':
            subscriptionContent = generateQuantumultConfig(finalLinks);
            break;
        case 'base64':
        default:
            subscriptionContent = btoa(finalLinks.join('\n'));
    }
    
    return new Response(subscriptionContent, {
        headers: { 
            'Content-Type': contentType,
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Profile-Update-Interval': '24'
        },
    });
}

// ===================== HTML 页面 (iOS 26 风格) =====================
function generateHomePage(scuValue) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>智能节点生成与转换工具</title>
    <style>
        :root {
            --bg-color: #F2F2F7; --card-bg: rgba(255, 255, 255, 0.7); --text-main: #1D1D1F;
            --text-secondary: #86868B; --accent: #007AFF; --border-color: rgba(60, 60, 67, 0.1);
            --input-bg: rgba(118, 118, 128, 0.12); --success: #34C759; --danger: #FF3B30;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #000000; --card-bg: rgba(28, 28, 30, 0.6); --text-main: #F5F5F7;
                --text-secondary: #EBEBF5; --accent: #0A84FF; --border-color: rgba(84, 84, 88, 0.4);
                --input-bg: rgba(118, 118, 128, 0.24); --success: #30D158; --danger: #FF453A;
            }
        }
        body {
            background-color: var(--bg-color); color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Arial, sans-serif;
            margin: 0; padding: calc(env(safe-area-inset-top) + 20px) 20px 40px; -webkit-font-smoothing: antialiased;
        }
        .container { max-width: 650px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin: 0 0 8px; }
        .header p { font-size: 15px; color: var(--text-secondary); margin: 0; }
        .card {
            background: var(--card-bg); backdrop-filter: blur(40px) saturate(200%); -webkit-backdrop-filter: blur(40px) saturate(200%);
            border-radius: 24px; padding: 24px; margin-bottom: 24px; border: 1px solid var(--border-color);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.04); transition: transform 0.3s ease;
        }
        .card-title { font-size: 18px; font-weight: 600; margin-top: 0; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .form-group { margin-bottom: 16px; }
        .form-group:last-child { margin-bottom: 0; }
        label { display: block; font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; }
        input[type="text"], textarea {
            width: 100%; padding: 14px 16px; font-size: 16px; background: var(--input-bg); border: 1.5px solid transparent;
            border-radius: 14px; color: var(--text-main); outline: none; box-sizing: border-box; transition: all 0.2s ease;
        }
        textarea { resize: vertical; min-height: 50px; }
        input:focus, textarea:focus { border-color: var(--accent); background: transparent; }
        .list-item { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--border-color); }
        .list-item:last-child { border-bottom: none; }
        .list-item-text { display: flex; flex-direction: column; gap: 4px; }
        .list-item-title { font-size: 16px; font-weight: 500; }
        .list-item-desc { font-size: 12px; color: var(--text-secondary); }
        .switch {
            width: 50px; height: 30px; background: rgba(120, 120, 128, 0.32); border-radius: 15px;
            position: relative; cursor: pointer; transition: background 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .switch.active { background: var(--success); }
        .switch::after {
            content: ''; position: absolute; top: 2px; left: 2px; width: 26px; height: 26px;
            background: #FFF; border-radius: 50%; box-shadow: 0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .switch.active::after { transform: translateX(20px); }
        .btn {
            width: 100%; padding: 16px; background: var(--accent); color: white; border: none;
            border-radius: 16px; font-size: 17px; font-weight: 600; cursor: pointer;
            transition: transform 0.1s, background 0.2s; display: flex; justify-content: center; align-items: center; gap: 8px;
        }
        .btn:active { transform: scale(0.97); }
        .btn-secondary { background: var(--input-bg); color: var(--accent); }
        .checkbox-group { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; }
        .checkbox-item { display: flex; align-items: center; gap: 8px; font-size: 15px; cursor: pointer; }
        .checkbox-item input { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }
        .client-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-top: 12px; }
        .client-btn {
            padding: 12px 10px; background: var(--input-bg); color: var(--accent); border: 1px solid transparent;
            border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; text-align: center;
        }
        .client-btn:active { transform: scale(0.95); background: var(--accent); color: #fff; }
        .result-box {
            margin-top: 16px; padding: 16px; background: var(--input-bg); border-radius: 14px;
            font-size: 13px; word-break: break-all; display: none; line-height: 1.5;
            max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color);
        }
        #protocolSection { transition: opacity 0.3s ease; }
        .disabled-section { opacity: 0.4; pointer-events: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>智能节点中心</h1>
            <p>生成、优选、混合转换一站式管理</p>
        </div>
        
        <div class="card">
            <h3 class="card-title">🌐 基础鉴权</h3>
            <div class="form-group">
                <label>域名 (Domain)</label>
                <input type="text" id="domain" placeholder="example.workers.dev">
            </div>
            <div class="form-group">
                <label>UUID / Password</label>
                <input type="text" id="uuid" placeholder="xxxx-xxxx-xxxx-xxxx">
            </div>
        </div>
        
        <div class="card" style="border: 1.5px dashed var(--accent);">
            <h3 class="card-title" style="color: var(--accent);">🔄 外部节点源导入 (可选)</h3>
            <p style="font-size: 13px; color: var(--text-secondary); margin-top:-10px; margin-bottom:15px;">填入内容后自动进入<b>混合替换模式</b>，仅替换下方收集到的优选IP/域名。</p>
            <div class="form-group">
                <label>订阅链接 URL</label>
                <input type="text" id="importSubUrl" placeholder="https://" oninput="checkImportMode()">
            </div>
            <div class="form-group">
                <label>手动填入节点 (多条换行)</label>
                <textarea id="importNodes" placeholder="vless://..." oninput="checkImportMode()"></textarea>
            </div>
            <button type="button" class="btn btn-secondary" onclick="previewNodes()">预览解析节点配置</button>
            <div id="parsedNodesPreview" class="result-box"></div>
        </div>

        <div class="card">
            <h3 class="card-title">⚡️ 优选与提取控制</h3>
            <div class="list-item" onclick="toggleSwitch('switchDomain')">
                <div class="list-item-text">
                    <span class="list-item-title">默认优选域名</span>
                    <span class="list-item-desc">启用内置的高速反代域名列表</span>
                </div>
                <div class="switch active" id="switchDomain"></div>
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>自定义域名 URL (支持多行)</label>
                <textarea id="customDomainUrls" placeholder="从该 URL 提取额外优选域名"></textarea>
            </div>
            
            <div class="list-item" onclick="toggleSwitch('switchIP')">
                <div class="list-item-text">
                    <span class="list-item-title">默认优选 IP</span>
                    <span class="list-item-desc">启用内置实时优选 IPv4/IPv6</span>
                </div>
                <div class="switch active" id="switchIP"></div>
            </div>
            <div class="list-item" onclick="toggleSwitch('switchGitHub')">
                <div class="list-item-text">
                    <span class="list-item-title">第三方接口优选 IP</span>
                    <span class="list-item-desc">启用 GitHub 或自建测速源提取</span>
                </div>
                <div class="switch active" id="switchGitHub"></div>
            </div>
            <div class="form-group" style="margin-top: 12px;">
                <label>自定义 IP 源 URL (最多提取30个)</label>
                <textarea id="customIpUrls" placeholder="https://..."></textarea>
            </div>
        </div>

        <div class="card">
            <h3 class="card-title">⚙️ 全局参数筛选</h3>
            <div class="form-group">
                <label>IP 版本允许</label>
                <div class="checkbox-group">
                    <label class="checkbox-item"><input type="checkbox" id="ipv4Enabled" checked> IPv4</label>
                    <label class="checkbox-item"><input type="checkbox" id="ipv6Enabled" checked> IPv6</label>
                </div>
            </div>
            <div class="form-group" style="margin-top: 20px;">
                <label>运营商放行 (国内优化)</label>
                <div class="checkbox-group">
                    <label class="checkbox-item"><input type="checkbox" id="ispMobile" checked> 中国移动</label>
                    <label class="checkbox-item"><input type="checkbox" id="ispUnicom" checked> 中国联通</label>
                    <label class="checkbox-item"><input type="checkbox" id="ispTelecom" checked> 中国电信</label>
                </div>
            </div>
            <div class="list-item" style="margin-top: 10px;" onclick="toggleSwitch('switchTLS')">
                <div class="list-item-text">
                    <span class="list-item-title">仅强制 TLS 节点</span>
                    <span class="list-item-desc">自动过滤/关闭 80 端口等非加密节点</span>
                </div>
                <div class="switch" id="switchTLS"></div>
            </div>
        </div>

        <div class="card" id="protocolSection">
            <h3 class="card-title">🔑 协议类型 (生成模式)</h3>
            <div class="list-item" onclick="toggleSwitch('switchVL')">
                <span class="list-item-title">VLESS (WS)</span><div class="switch active" id="switchVL"></div>
            </div>
            <div class="list-item" onclick="toggleSwitch('switchTJ')">
                <span class="list-item-title">Trojan (WS)</span><div class="switch" id="switchTJ"></div>
            </div>
            <div class="list-item" onclick="toggleSwitch('switchVM')">
                <span class="list-item-title">VMess (WS)</span><div class="switch" id="switchVM"></div>
            </div>
            <div class="list-item" onclick="toggleSwitch('switchECH')">
                <span class="list-item-title">开启 ECH 参数</span><div class="switch" id="switchECH"></div>
            </div>
        </div>

        <div class="card">
            <h3 class="card-title">🚀 订阅下发</h3>
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 15px;">自适应链接可直接粘贴至任何主流客户端，服务端将自动侦测设备 (User-Agent) 下发匹配格式。</p>
            <button class="btn" style="background: var(--success);" onclick="generateClientLink('auto', '全协议自适应 (Auto)')">✨ 一键全协议自适应订阅</button>
            
            <p style="font-size: 13px; color: var(--text-secondary); margin-top: 25px; margin-bottom: 8px;">单独指定客户端专属订阅（调用外部转换及原生Base64）：</p>
            <div class="client-grid">
                <button class="client-btn" onclick="generateClientLink('v2ray', '通用V2RAY')">通用V2RAY</button>
                <button class="client-btn" onclick="generateClientLink('v2ray', 'NEKORAY')">NEKORAY</button>
                <button class="client-btn" onclick="generateClientLink('v2ray', 'Shadowrocket')">Shadowrocket</button>
                <button class="client-btn" onclick="generateClientLink('clash', 'CLASH')">CLASH</button>
                <button class="client-btn" onclick="generateClientLink('surge', 'SURGE')">SURGE</button>
                <button class="client-btn" onclick="generateClientLink('quanx', 'QUANTUMULT X')">QUANTUMULT X</button>
            </div>
            <div class="result-box" id="finalSubUrl" style="background: rgba(0, 122, 255, 0.1); color: var(--accent); border-color: rgba(0,122,255,0.2);"></div>
        </div>
    </div>
    
    <script>
        const SUB_CONVERTER_URL = "${scuValue}";

        let switches = { switchDomain: true, switchIP: true, switchGitHub: true, switchVL: true, switchTJ: false, switchVM: false, switchTLS: false, switchECH: false };
        
        function toggleSwitch(id) {
            const el = document.getElementById(id);
            if (el.closest('.disabled-section')) return;
            switches[id] = !switches[id];
            el.classList.toggle('active');
        }

        function checkImportMode() {
            const hasImport = document.getElementById('importSubUrl').value.trim() || document.getElementById('importNodes').value.trim();
            const section = document.getElementById('protocolSection');
            if (hasImport) section.classList.add('disabled-section');
            else section.classList.remove('disabled-section');
        }

        async function previewNodes() {
            const importSubUrl = document.getElementById('importSubUrl').value.trim();
            const importNodes = document.getElementById('importNodes').value.trim();
            const previewBox = document.getElementById('parsedNodesPreview');
            if (!importSubUrl && !importNodes) { alert('请先输入订阅URL或节点内容'); return; }

            previewBox.style.display = 'block';
            previewBox.innerHTML = '<span style="color:var(--accent)">正在解析，请稍候...</span>';
            try {
                const response = await fetch('/parse-nodes', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: importSubUrl, text: importNodes })
                });
                const data = await response.json();
                if (data.nodes && data.nodes.length > 0) {
                    previewBox.innerHTML = '<strong>成功解析 ' + data.nodes.length + ' 个节点:</strong><br><br>' + 
                        data.nodes.map(n => n.substring(0, 90) + '...').join('<br><br>');
                } else {
                    previewBox.innerHTML = '<span style="color:var(--danger)">未解析出有效节点，请检查格式或链接连通性。</span>';
                }
            } catch (e) {
                previewBox.innerHTML = '<span style="color:var(--danger)">解析请求失败: ' + e.message + '</span>';
            }
        }

        function generateClientLink(clientType, clientName) {
            const domain = document.getElementById('domain').value.trim();
            const uuid = document.getElementById('uuid').value.trim();
            const hasImport = document.getElementById('importSubUrl').value.trim() || document.getElementById('importNodes').value.trim();
            
            if (!hasImport && (!domain || !uuid)) {
                alert('生成模式下，请先补全基础鉴权信息 (域名和UUID)');
                document.getElementById('domain').focus();
                return;
            }
            
            const config = {
                domain: domain, uuid: uuid,
                epd: switches.switchDomain, epi: switches.switchIP, egi: switches.switchGitHub,
                evEnabled: switches.switchVL,
                ipv4: document.getElementById('ipv4Enabled').checked,
                ipv6: document.getElementById('ipv6Enabled').checked,
                ispMobile: document.getElementById('ispMobile').checked,
                ispUnicom: document.getElementById('ispUnicom').checked,
                ispTelecom: document.getElementById('ispTelecom').checked,
                disableNonTLS: switches.switchTLS, echEnabled: switches.switchECH,
                customDomainUrls: document.getElementById('customDomainUrls').value.trim(),
                customIpUrls: document.getElementById('customIpUrls').value.trim(),
                importSubUrl: document.getElementById('importSubUrl').value.trim(),
                importNodesText: document.getElementById('importNodes').value.trim()
            };

            const configB64 = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
            const baseUrl = new URL(window.location.href).origin;
            
            let finalUrl = '';
            
            // 路由不同的请求机制
            if (clientType === 'auto') {
                // 自适应链接
                finalUrl = \`\${baseUrl}/sub?config=\${configB64}&target=auto\`;
            } else if (clientType === 'v2ray') {
                // 原生 Base64，给 V2Ray, Shadowrocket, Nekoray 使用
                finalUrl = \`\${baseUrl}/sub?config=\${configB64}&target=base64\`;
            } else {
                // 调用外部转换器，给 Clash, Surge, QuanX 使用
                const sourceBase64Url = \`\${baseUrl}/sub?config=\${configB64}&target=base64\`;
                finalUrl = SUB_CONVERTER_URL + '?target=' + clientType + '&url=' + encodeURIComponent(sourceBase64Url) + '&insert=false&emoji=true&list=false&xudp=false&udp=false&tfo=false&expand=true&scv=false&fdn=false&new_name=true';
            }

            const urlElement = document.getElementById('finalSubUrl');
            urlElement.innerHTML = \`<strong>[\${clientName}] 订阅链接生成成功：</strong><br><br>\${finalUrl}\`;
            urlElement.style.display = 'block';
            
            navigator.clipboard.writeText(finalUrl).then(() => {
                let originalText = urlElement.innerHTML;
                urlElement.innerHTML = '<span style="color: var(--success); font-weight: bold;">✓ 链接已复制到剪贴板！可以直接去客户端粘贴使用了。</span>';
                setTimeout(() => { urlElement.innerHTML = originalText; }, 2500);
            });
        }
    </script>
</body>
</html>`;
}

// 主处理器
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        
        if (path === '/' || path === '') {
            return new Response(generateHomePage(env?.scu || scu), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        
        if (path === '/parse-nodes' && request.method === 'POST') {
            try {
                const body = await request.json();
                let nodes = [];
                if (body.url) nodes = nodes.concat(await parseImportedNodesContent(await (await fetch(body.url)).text()));
                if (body.text) nodes = nodes.concat(await parseImportedNodesContent(body.text));
                return new Response(JSON.stringify({ success: true, nodes: nodes }), { headers: { 'Content-Type': 'application/json' } });
            } catch(e) {
                return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
            }
        }
        
        if (path.endsWith('/sub')) {
            const configStr = url.searchParams.get('config');
            if (configStr) {
                try {
                    const configs = JSON.parse(decodeURIComponent(escape(atob(configStr))));
                    configs.customDomainUrls = extractUrls(configs.customDomainUrls);
                    configs.customIpUrls = extractUrls(configs.customIpUrls);
                    return await handleSubscriptionRequest(request, configs.uuid || 'user', configs.domain, configs);
                } catch(e) {
                    return new Response('Config decode error: ' + e.message, { status: 400 });
                }
            }
        }
        
        return new Response('Not Found', { status: 404 });
    }
};
