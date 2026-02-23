// Cloudflare Worker - 优选工具（增强版）
// 新增功能：
// 1. 批量节点IP替换（保留原节点结构，仅替换IP地址）
// 2. 从用户输入的URL提取优选域名
// 3. 批量URL获取优选IP（最多30个）
// 修复记录：
// - 修正了自适应订阅链接无法解析导致抛出 500 错误的问题（修改了 User-Agent 并增强 Base64 解析）。
// - 将错误抛出机制改为返回“占位错误节点”，防止订阅转换器崩溃报错 500。

// 默认配置
let customPreferredIPs = [];
let customPreferredDomains = [];
let epd = true;  // 启用优选域名
let epi = true;  // 启用优选IP
let egi = true;  // 启用GitHub优选
let ev = true;   // 启用VLESS协议
let et = false;  // 启用Trojan协议
let vm = false;  // 启用VMess协议
let scu = 'https://url.v1.mk/sub';  // 订阅转换地址
// ECH (Encrypted Client Hello)
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

// UUID验证
function isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

// ============================================================
// 错误占位节点生成（防止转换器500崩溃）
// ============================================================
function generateErrorResponse(target, message) {
    const errNode = `vless://00000000-0000-0000-0000-000000000000@127.0.0.1:80?encryption=none&security=none&type=ws&host=error.com&path=%2F#${encodeURIComponent(message)}`;
    let content, contentType;
    
    if (target.toLowerCase() === 'clash' || target.toLowerCase() === 'clashr') {
        content = generateClashConfig([errNode]);
        contentType = 'text/yaml; charset=utf-8';
    } else if (target.toLowerCase().startsWith('surge')) {
        content = generateSurgeConfig([errNode]);
        contentType = 'text/plain; charset=utf-8';
    } else {
        content = btoa(errNode);
        contentType = 'text/plain; charset=utf-8';
    }

    return new Response(content, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

// 获取动态IP列表（支持IPv4/IPv6和运营商筛选）
async function fetchDynamicIPs(ipv4Enabled = true, ipv6Enabled = true, ispMobile = true, ispUnicom = true, ispTelecom = true) {
    const v4Url = "https://www.wetest.vip/page/cloudflare/address_v4.html";
    const v6Url = "https://www.wetest.vip/page/cloudflare/address_v6.html";
    let results = [];

    try {
        const fetchPromises = [];
        if (ipv4Enabled) {
            fetchPromises.push(fetchAndParseWetest(v4Url));
        } else {
            fetchPromises.push(Promise.resolve([]));
        }
        if (ipv6Enabled) {
            fetchPromises.push(fetchAndParseWetest(v6Url));
        } else {
            fetchPromises.push(Promise.resolve([]));
        }

        const [ipv4List, ipv6List] = await Promise.all(fetchPromises);
        results = [...ipv4List, ...ipv6List];
        
        // 按运营商筛选
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

// 解析wetest页面
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

// 整理成数组
async function 整理成数组(内容) {
    var 替换后的内容 = 内容.replace(/[\t"'\r\n]+/g, ',').replace(/,+/g, ',');
    if (替换后的内容.charAt(0) == ',') 替换后的内容 = 替换后的内容.slice(1);
    if (替换后的内容.charAt(替换后的内容.length - 1) == ',') 替换后的内容 = 替换后的内容.slice(0, 替换后的内容.length - 1);
    const 地址数组 = 替换后的内容.split(',');
    return 地址数组;
}

// 请求优选API
async function 请求优选API(urls, 默认端口 = '443', 超时时间 = 3000) {
    if (!urls?.length) return [];
    const results = new Set();
    await Promise.allSettled(urls.map(async (url) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 超时时间);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            let text = '';
            try {
                const buffer = await response.arrayBuffer();
                const contentType = (response.headers.get('content-type') || '').toLowerCase();
                const charset = contentType.match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase() || '';

                let decoders = ['utf-8', 'gb2312'];
                if (charset.includes('gb') || charset.includes('gbk') || charset.includes('gb2312')) {
                    decoders = ['gb2312', 'utf-8'];
                }

                let decodeSuccess = false;
                for (const decoder of decoders) {
                    try {
                        const decoded = new TextDecoder(decoder).decode(buffer);
                        if (decoded && decoded.length > 0 && !decoded.includes('\ufffd')) {
                            text = decoded;
                            decodeSuccess = true;
                            break;
                        } else if (decoded && decoded.length > 0) {
                            continue;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (!decodeSuccess) {
                    text = await response.text();
                }

                if (!text || text.trim().length === 0) {
                    return;
                }
            } catch (e) {
                return;
            }
            const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
            const isCSV = lines.length > 1 && lines[0].includes(',');
            const IPV6_PATTERN = /^[^\[\]]*:[^\[\]]*:[^\[\]]/;
            if (!isCSV) {
                lines.forEach(line => {
                    const hashIndex = line.indexOf('#');
                    const [hostPart, remark] = hashIndex > -1 ? [line.substring(0, hashIndex), line.substring(hashIndex)] : [line, ''];
                    let hasPort = false;
                    if (hostPart.startsWith('[')) {
                        hasPort = /\]:(\\d+)$/.test(hostPart);
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
                if (headers.includes('IP地址') && headers.includes('端口') && headers.includes('数据中心')) {
                    const ipIdx = headers.indexOf('IP地址'), portIdx = headers.indexOf('端口');
                    const remarkIdx = headers.indexOf('国家') > -1 ? headers.indexOf('国家') :
                        headers.indexOf('城市') > -1 ? headers.indexOf('城市') : headers.indexOf('数据中心');
                    const tlsIdx = headers.indexOf('TLS');
                    dataLines.forEach(line => {
                        const cols = line.split(',').map(c => c.trim());
                        if (tlsIdx !== -1 && cols[tlsIdx]?.toLowerCase() !== 'true') return;
                        const wrappedIP = IPV6_PATTERN.test(cols[ipIdx]) ? `[${cols[ipIdx]}]` : cols[ipIdx];
                        results.add(`${wrappedIP}:${cols[portIdx]}#${cols[remarkIdx]}`);
                    });
                } else if (headers.some(h => h.includes('IP')) && headers.some(h => h.includes('延迟')) && headers.some(h => h.includes('下载速度'))) {
                    const ipIdx = headers.findIndex(h => h.includes('IP'));
                    const delayIdx = headers.findIndex(h => h.includes('延迟'));
                    const speedIdx = headers.findIndex(h => h.includes('下载速度'));
                    const port = new URL(url).searchParams.get('port') || 默认端口;
                    dataLines.forEach(line => {
                        const cols = line.split(',').map(c => c.trim());
                        const wrappedIP = IPV6_PATTERN.test(cols[ipIdx]) ? `[${cols[ipIdx]}]` : cols[ipIdx];
                        results.add(`${wrappedIP}:${port}#CF优选 ${cols[delayIdx]}ms ${cols[speedIdx]}MB/s`);
                    });
                }
            }
        } catch (e) { }
    }));
    return Array.from(results);
}

// 从GitHub获取优选IP
async function fetchAndParseNewIPs(piu) {
    const url = piu || defaultIPURL;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const text = await response.text();
        const results = [];
        const lines = text.trim().replace(/\r/g, "").split('\n');
        const regex = /^([^:]+):(\d+)#(.*)$/;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            const match = trimmedLine.match(regex);
            if (match) {
                results.push({
                    ip: match[1],
                    port: parseInt(match[2], 10),
                    name: match[3].trim() || match[1]
                });
            }
        }
        return results;
    } catch (error) {
        return [];
    }
}

// ============================================================
// 从指定URL获取优选域名列表
// ============================================================
async function fetchCustomDomains(domainUrl) {
    if (!domainUrl || !domainUrl.trim()) return [];
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(domainUrl.trim(), {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        clearTimeout(timeoutId);
        if (!response.ok) return [];
        const text = await response.text();
        const domains = [];
        const lines = text.trim().split(/[\r\n,;]+/);
        for (const line of lines) {
            const domain = line.trim().replace(/^#.*/, '').trim();
            if (!domain) continue;
            if (domain.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(domain) && !/^\[/.test(domain)) {
                domains.push({ ip: domain, isp: domain, name: domain });
            }
        }
        return domains;
    } catch (e) {
        return [];
    }
}

// ============================================================
// 从多个URL批量获取优选IP（最多30个）
// ============================================================
async function fetchMultipleURLIPs(urlList, maxCount = 30) {
    if (!urlList || urlList.length === 0) return [];
    const validUrls = urlList.filter(u => u && u.trim().toLowerCase().startsWith('http'));
    if (validUrls.length === 0) return [];
    
    try {
        const allRawIPs = await 请求优选API(validUrls, '443', 5000);
        const seen = new Set();
        const ipList = [];
        
        for (const rawAddr of allRawIPs) {
            if (ipList.length >= maxCount) break;
            const regex = /^(\[[\da-fA-F:]+\]|[\d.]+|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*)(?::(\d+))?(?:#(.+))?$/;
            const match = rawAddr.match(regex);
            if (match) {
                const ip = match[1].replace(/[\[\]]/g, '');
                if (seen.has(ip)) continue;
                seen.add(ip);
                ipList.push({
                    ip: ip,
                    port: match[2] ? parseInt(match[2]) : 443,
                    name: match[3] || ip,
                    isp: match[3] || ip
                });
            }
        }
        return ipList;
    } catch (e) {
        return [];
    }
}

// ============================================================
// 解析节点链接中的IP/Host，并替换为新IP
// ============================================================
function parseHostPortFromNode(nodeLink) {
    try {
        if (nodeLink.startsWith('vmess://')) {
            let b64 = nodeLink.substring(8);
            b64 = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
            while (b64.length % 4) b64 += '=';
            const decoded = atob(b64);
            let jsonStr = decoded;
            try {
                jsonStr = decodeURIComponent(decoded.split('').map(c =>
                    '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
                ).join(''));
            } catch (e) { jsonStr = decoded; }
            const config = JSON.parse(jsonStr);
            return { protocol: 'vmess', config };
        } else if (nodeLink.startsWith('vless://') || nodeLink.startsWith('trojan://')) {
            const proto = nodeLink.startsWith('vless://') ? 'vless' : 'trojan';
            const withoutProto = nodeLink.substring(proto.length + 3);
            const atIdx = withoutProto.indexOf('@');
            if (atIdx === -1) return null;
            const userId = withoutProto.substring(0, atIdx);
            const rest = withoutProto.substring(atIdx + 1);
            const hashIdx = rest.lastIndexOf('#');
            const nodeName = hashIdx > -1 ? decodeURIComponent(rest.substring(hashIdx + 1)) : '';
            const withoutName = hashIdx > -1 ? rest.substring(0, hashIdx) : rest;
            const queryIdx = withoutName.indexOf('?');
            const hostPortStr = queryIdx > -1 ? withoutName.substring(0, queryIdx) : withoutName;
            const queryStr = queryIdx > -1 ? withoutName.substring(queryIdx + 1) : '';
            
            let host, port;
            if (hostPortStr.startsWith('[')) {
                const bracketEnd = hostPortStr.indexOf(']');
                host = hostPortStr.substring(1, bracketEnd);
                port = hostPortStr.substring(bracketEnd + 2);
            } else {
                const lastColon = hostPortStr.lastIndexOf(':');
                host = hostPortStr.substring(0, lastColon);
                port = hostPortStr.substring(lastColon + 1);
            }
            return { protocol: proto, userId, host, port: parseInt(port) || 443, queryStr, nodeName };
        }
    } catch (e) { }
    return null;
}

function rebuildNodeWithNewIP(parsed, newIP, newPort, newLabel) {
    if (!parsed) return null;
    const safeIP = newIP.includes(':') ? `[${newIP}]` : newIP;
    const port = newPort || parsed.port;
    const label = newLabel || `${newIP}-${port}`;
    
    try {
        if (parsed.protocol === 'vmess') {
            const config = { ...parsed.config };
            config.add = newIP;
            config.port = port.toString();
            config.ps = label;
            const jsonStr = JSON.stringify(config);
            const b64 = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g,
                (match, p1) => String.fromCharCode('0x' + p1)));
            return `vmess://${b64}`;
        } else {
            const proto = parsed.protocol;
            const queryPart = parsed.queryStr ? `?${parsed.queryStr}` : '';
            return `${proto}://${parsed.userId}@${safeIP}:${port}${queryPart}#${encodeURIComponent(label)}`;
        }
    } catch (e) {
        return null;
    }
}

function batchReplaceNodeIPs(originalNodes, ipList, maxIPs = 30) {
    const results = [];
    const limitedIPs = ipList.slice(0, maxIPs);
    
    for (const nodeLink of originalNodes) {
        const trimmed = nodeLink.trim();
        if (!trimmed) continue;
        const parsed = parseHostPortFromNode(trimmed);
        if (!parsed) continue;
        
        for (const ipEntry of limitedIPs) {
            const newIP = typeof ipEntry === 'string' ? ipEntry.split(':')[0] : (ipEntry.ip || '');
            if (!newIP) continue;
            const newPort = typeof ipEntry === 'string'
                ? (ipEntry.includes(':') ? parseInt(ipEntry.split(':').pop()) : null)
                : (ipEntry.port || null);
            const ipLabel = typeof ipEntry === 'string'
                ? (ipEntry.split('#')[1] || newIP)
                : (ipEntry.name || ipEntry.isp || newIP);
            
            const baseName = parsed.nodeName || parsed.config?.ps || newIP;
            const newLabel = `${ipLabel}-${newPort || parsed.port}`;
            const newNode = rebuildNodeWithNewIP(parsed, newIP, newPort, newLabel);
            if (newNode) results.push(newNode);
        }
    }
    return results;
}

// ============================================================
// 处理节点IP替换订阅请求
// ============================================================
// 从URL拉取节点列表，增加了处理自适应面板的特定User-Agent和强化Base64解析
async function fetchNodesFromURL(nodeUrl) {
    if (!nodeUrl || !nodeUrl.trim()) return [];
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(nodeUrl.trim(), {
            signal: controller.signal,
            headers: { 
                // 使用V2Ray客户端的UA来强制自适应订阅下发Base64节点，而不是网页或Clash配置
                'User-Agent': 'v2rayNG/1.8.5 v2rayN/3.29',
                'Accept': '*/*'
            }
        });
        clearTimeout(timeoutId);
        if (!response.ok) return [];
        const text = await response.text();
        
        let decoded = text.trim();
        try {
            // 安全增强的 Base64 解码
            let safeBase64 = decoded.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
            while (safeBase64.length % 4) safeBase64 += '=';
            const b64decoded = atob(safeBase64);
            let utf8decoded = b64decoded;
            try {
                utf8decoded = decodeURIComponent(escape(b64decoded));
            } catch(e) {}
            
            if (utf8decoded.includes('://')) decoded = utf8decoded;
            else if (b64decoded.includes('://')) decoded = b64decoded;
        } catch (e) { /* 如果解码失败，假定是明文 */ }
        
        return decoded.split('\n').map(l => l.trim()).filter(l =>
            l.startsWith('vless://') || l.startsWith('trojan://') || l.startsWith('vmess://')
        );
    } catch (e) {
        return [];
    }
}

function filterNodesByTLS(nodes, disableNonTLS) {
    if (!disableNonTLS) return nodes;
    return nodes.filter(link => {
        if (link.startsWith('vmess://')) {
            try {
                let b64 = link.substring(8);
                b64 = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
                while (b64.length % 4) b64 += '=';
                let jsonStr = atob(b64);
                try { jsonStr = decodeURIComponent(jsonStr.split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2,'0')).join('')); } catch(e){}
                const cfg = JSON.parse(jsonStr);
                return cfg.tls === 'tls';
            } catch (e) { return true; }
        }
        return link.includes('security=tls') || link.includes('security%3Dtls');
    });
}

// 核心替换节点逻辑
async function handleReplaceIPSubscription(request, originalNodes, ipSources, maxIPs = 30) {
    const url = new URL(request.url);
    const target = url.searchParams.get('target') || 'base64';
    const disableNonTLS = url.searchParams.get('dkby') === 'yes';
    const useEpd = url.searchParams.get('epd') !== 'no';

    if (!originalNodes || originalNodes.length === 0) {
        return generateErrorResponse(target, "错误：无法获取/解析源订阅数据");
    }
    
    // 获取优选IP列表
    let ipList = [];
    const ipv4Enabled = url.searchParams.get('ipv4') !== 'no';
    const ipv6Enabled = url.searchParams.get('ipv6') !== 'no';
    const ispMobile = url.searchParams.get('ispMobile') !== 'no';
    const ispUnicom = url.searchParams.get('ispUnicom') !== 'no';
    const ispTelecom = url.searchParams.get('ispTelecom') !== 'no';
    const useWetest = url.searchParams.get('useWetest') !== 'no';
    
    if (useWetest) {
        const wetestIPs = await fetchDynamicIPs(ipv4Enabled, ipv6Enabled, ispMobile, ispUnicom, ispTelecom);
        ipList.push(...wetestIPs);
    }
    if (ipSources && ipSources.length > 0) {
        const urlIPs = await fetchMultipleURLIPs(ipSources, maxIPs);
        ipList.push(...urlIPs);
    }
    if (ipList.length === 0) {
        const defaultIPs = await fetchAndParseNewIPs(defaultIPURL);
        ipList.push(...defaultIPs);
    }
    ipList = ipList.slice(0, maxIPs);

    if (ipList.length === 0) {
        return generateErrorResponse(target, "错误：无法获取优选IP列表");
    }

    // 批量IP替换
    let replacedLinks = batchReplaceNodeIPs(originalNodes, ipList, maxIPs);

    // 优选域名替换
    if (useEpd) {
        const domainUrlsStr = url.searchParams.get('domainUrls');
        let domainHostList = [...directDomains.map(d => d.domain || d.name)];
        if (domainUrlsStr) {
            const domainUrls = domainUrlsStr.split(',').map(u => u.trim()).filter(u => u.startsWith('http'));
            for (const du of domainUrls) {
                try {
                    const extras = await fetchCustomDomains(du);
                    domainHostList.push(...extras.map(d => d.ip));
                } catch(e) {}
            }
        }
        const domainItems = domainHostList.map(d => ({ ip: d, port: 443, name: d, isp: d }));
        const domainLinks = batchReplaceNodeIPs(originalNodes, domainItems, domainItems.length);
        replacedLinks.push(...domainLinks);
    }

    // TLS过滤
    replacedLinks = filterNodesByTLS(replacedLinks, disableNonTLS);

    if (replacedLinks.length === 0) {
        return generateErrorResponse(target, "错误：节点替换失败或节点格式不支持");
    }
    
    let content;
    let contentType = 'text/plain; charset=utf-8';
    
    switch (target.toLowerCase()) {
        case 'clash':
        case 'clashr':
            content = generateClashConfig(replacedLinks);
            contentType = 'text/yaml; charset=utf-8';
            break;
        default:
            content = btoa(replacedLinks.join('\n'));
    }
    
    return new Response(content, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

// 以下是普通节点生成逻辑...
function generateLinksFromSource(list, user, workerDomain, disableNonTLS = false, customPath = '/', echConfig = null) {
    const CF_HTTP_PORTS = [80, 8080, 8880, 2052, 2082, 2086, 2095];
    const CF_HTTPS_PORTS = [443, 2053, 2083, 2087, 2096, 8443];
    const defaultHttpsPorts = [443];
    const defaultHttpPorts = disableNonTLS ? [] : [80];
    const links = [];
    const wsPath = customPath || '/';
    const proto = 'vless';

    list.forEach(item => {
        let nodeNameBase = item.isp ? item.isp.replace(/\s/g, '_') : (item.name || item.domain || item.ip);
        if (item.colo && item.colo.trim()) nodeNameBase = `${nodeNameBase}-${item.colo.trim()}`;
        const safeIP = item.ip.includes(':') ? `[${item.ip}]` : item.ip;
        
        let portsToGenerate = [];
        if (item.port) {
            const port = item.port;
            if (CF_HTTPS_PORTS.includes(port)) portsToGenerate.push({ port: port, tls: true });
            else if (CF_HTTP_PORTS.includes(port)) portsToGenerate.push({ port: port, tls: false });
            else portsToGenerate.push({ port: port, tls: true });
        } else {
            defaultHttpsPorts.forEach(port => portsToGenerate.push({ port: port, tls: true }));
            defaultHttpPorts.forEach(port => portsToGenerate.push({ port: port, tls: false }));
        }

        portsToGenerate.forEach(({ port, tls }) => {
            if (tls) {
                const wsNodeName = `${nodeNameBase}-${port}-WS-TLS`;
                const wsParams = new URLSearchParams({ encryption: 'none', security: 'tls', sni: workerDomain, fp: 'chrome', type: 'ws', host: workerDomain, path: wsPath });
                if (echConfig) { wsParams.set('alpn', 'h3,h2,http/1.1'); wsParams.set('ech', echConfig); }
                links.push(`${proto}://${user}@${safeIP}:${port}?${wsParams.toString()}#${encodeURIComponent(wsNodeName)}`);
            } else {
                const wsNodeName = `${nodeNameBase}-${port}-WS`;
                const wsParams = new URLSearchParams({ encryption: 'none', security: 'none', type: 'ws', host: workerDomain, path: wsPath });
                links.push(`${proto}://${user}@${safeIP}:${port}?${wsParams.toString()}#${encodeURIComponent(wsNodeName)}`);
            }
        });
    });
    return links;
}

async function generateTrojanLinksFromSource(list, user, workerDomain, disableNonTLS = false, customPath = '/', echConfig = null) {
    const CF_HTTP_PORTS = [80, 8080, 8880, 2052, 2082, 2086, 2095];
    const CF_HTTPS_PORTS = [443, 2053, 2083, 2087, 2096, 8443];
    const defaultHttpsPorts = [2087];
    const defaultHttpPorts = disableNonTLS ? [] : [80];
    const links = [];
    const wsPath = customPath || '/';
    const password = user;

    list.forEach(item => {
        let nodeNameBase = item.isp ? item.isp.replace(/\s/g, '_') : (item.name || item.domain || item.ip);
        if (item.colo && item.colo.trim()) nodeNameBase = `${nodeNameBase}-${item.colo.trim()}`;
        const safeIP = item.ip.includes(':') ? `[${item.ip}]` : item.ip;
        
        let portsToGenerate = [];
        if (item.port) {
            const port = item.port;
            if (CF_HTTPS_PORTS.includes(port)) portsToGenerate.push({ port: port, tls: true });
            else if (CF_HTTP_PORTS.includes(port)) { if (!disableNonTLS) portsToGenerate.push({ port: port, tls: false }); }
            else portsToGenerate.push({ port: port, tls: true });
        } else {
            defaultHttpsPorts.forEach(port => portsToGenerate.push({ port: port, tls: true }));
            defaultHttpPorts.forEach(port => portsToGenerate.push({ port: port, tls: false }));
        }

        portsToGenerate.forEach(({ port, tls }) => {
            if (tls) {
                const wsNodeName = `${nodeNameBase}-${port}-Trojan-WS-TLS`;
                const wsParams = new URLSearchParams({ security: 'tls', sni: workerDomain, fp: 'chrome', type: 'ws', host: workerDomain, path: wsPath });
                if (echConfig) { wsParams.set('alpn', 'h3,h2,http/1.1'); wsParams.set('ech', echConfig); }
                links.push(`trojan://${password}@${safeIP}:${port}?${wsParams.toString()}#${encodeURIComponent(wsNodeName)}`);
            } else {
                const wsNodeName = `${nodeNameBase}-${port}-Trojan-WS`;
                const wsParams = new URLSearchParams({ security: 'none', type: 'ws', host: workerDomain, path: wsPath });
                links.push(`trojan://${password}@${safeIP}:${port}?${wsParams.toString()}#${encodeURIComponent(wsNodeName)}`);
            }
        });
    });
    return links;
}

function generateVMessLinksFromSource(list, user, workerDomain, disableNonTLS = false, customPath = '/', echConfig = null) {
    const CF_HTTP_PORTS = [80, 8080, 8880, 2052, 2082, 2086, 2095];
    const CF_HTTPS_PORTS = [443, 2053, 2083, 2087, 2096, 8443];
    const defaultHttpsPorts = [8443];
    const defaultHttpPorts = disableNonTLS ? [] : [80];
    const links = [];
    const wsPath = customPath || '/';

    list.forEach(item => {
        let nodeNameBase = item.isp ? item.isp.replace(/\s/g, '_') : (item.name || item.domain || item.ip);
        if (item.colo && item.colo.trim()) nodeNameBase = `${nodeNameBase}-${item.colo.trim()}`;
        const safeIP = item.ip.includes(':') ? `[${item.ip}]` : item.ip;
        
        let portsToGenerate = [];
        if (item.port) {
            const port = item.port;
            if (CF_HTTPS_PORTS.includes(port)) portsToGenerate.push({ port: port, tls: true });
            else if (CF_HTTP_PORTS.includes(port)) { if (!disableNonTLS) portsToGenerate.push({ port: port, tls: false }); }
            else portsToGenerate.push({ port: port, tls: true });
        } else {
            defaultHttpsPorts.forEach(port => portsToGenerate.push({ port: port, tls: true }));
            defaultHttpPorts.forEach(port => portsToGenerate.push({ port: port, tls: false }));
        }

        portsToGenerate.forEach(({ port, tls }) => {
            const vmessConfig = {
                v: "2", ps: tls ? `${nodeNameBase}-${port}-VMess-WS-TLS` : `${nodeNameBase}-${port}-VMess-WS`,
                add: safeIP, port: port.toString(), id: user, aid: "0", scy: "auto", net: "ws", type: "none",
                host: workerDomain, path: wsPath, tls: tls ? "tls" : "none"
            };
            if (tls) { vmessConfig.sni = workerDomain; vmessConfig.fp = "chrome"; }
            const jsonStr = JSON.stringify(vmessConfig);
            const vmessBase64 = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) { return String.fromCharCode('0x' + p1); }));
            links.push(`vmess://${vmessBase64}`);
        });
    });
    return links;
}

function generateLinksFromNewIPs(list, user, workerDomain, customPath = '/', echConfig = null) {
    const CF_HTTP_PORTS = [80, 8080, 8880, 2052, 2082, 2086, 2095];
    const CF_HTTPS_PORTS = [443, 2053, 2083, 2087, 2096, 8443];
    const links = [];
    const wsPath = customPath || '/';
    const proto = 'vless';
    const echSuffix = echConfig ? `&alpn=h3%2Ch2%2Chttp%2F1.1&ech=${encodeURIComponent(echConfig)}` : '';
    
    list.forEach(item => {
        const nodeName = item.name.replace(/\s/g, '_');
        const port = item.port;
        if (CF_HTTPS_PORTS.includes(port)) {
            const wsNodeName = `${nodeName}-${port}-WS-TLS`;
            links.push(`${proto}://${user}@${item.ip}:${port}?encryption=none&security=tls&sni=${workerDomain}&fp=chrome&type=ws&host=${workerDomain}&path=${wsPath}${echSuffix}#${encodeURIComponent(wsNodeName)}`);
        } else if (CF_HTTP_PORTS.includes(port)) {
            const wsNodeName = `${nodeName}-${port}-WS`;
            links.push(`${proto}://${user}@${item.ip}:${port}?encryption=none&security=none&type=ws&host=${workerDomain}&path=${wsPath}#${encodeURIComponent(wsNodeName)}`);
        } else {
            const wsNodeName = `${nodeName}-${port}-WS-TLS`;
            links.push(`${proto}://${user}@${item.ip}:${port}?encryption=none&security=tls&sni=${workerDomain}&fp=chrome&type=ws&host=${workerDomain}&path=${wsPath}${echSuffix}#${encodeURIComponent(wsNodeName)}`);
        }
    });
    return links;
}

async function handleSubscriptionRequest(request, user, customDomain, piu, ipv4Enabled, ipv6Enabled, ispMobile, ispUnicom, ispTelecom, evEnabled, etEnabled, vmEnabled, disableNonTLS, customPath, echConfig = null, customDomainUrls = [], extraIPUrls = []) {
    const url = new URL(request.url);
    const finalLinks = [];
    const workerDomain = url.hostname;
    const nodeDomain = customDomain || url.hostname;
    const target = url.searchParams.get('target') || 'base64';
    const wsPath = customPath || '/';

    async function addNodesFromList(list) {
        const hasProtocol = evEnabled || etEnabled || vmEnabled;
        const useVL = hasProtocol ? evEnabled : true;
        if (useVL) finalLinks.push(...generateLinksFromSource(list, user, nodeDomain, disableNonTLS, wsPath, echConfig));
        if (etEnabled) finalLinks.push(...await generateTrojanLinksFromSource(list, user, nodeDomain, disableNonTLS, wsPath, echConfig));
        if (vmEnabled) finalLinks.push(...generateVMessLinksFromSource(list, user, nodeDomain, disableNonTLS, wsPath, echConfig));
    }

    const nativeList = [{ ip: workerDomain, isp: '原生地址' }];
    await addNodesFromList(nativeList);

    if (epd) {
        const domainList = directDomains.map(d => ({ ip: d.domain, isp: d.name || d.domain }));
        await addNodesFromList(domainList);
        if (customDomainUrls && customDomainUrls.length > 0) {
            for (const domainUrl of customDomainUrls) {
                try {
                    const extraDomains = await fetchCustomDomains(domainUrl);
                    if (extraDomains.length > 0) await addNodesFromList(extraDomains);
                } catch (e) { }
            }
        }
    }

    if (epi) {
        try {
            const dynamicIPList = await fetchDynamicIPs(ipv4Enabled, ipv6Enabled, ispMobile, ispUnicom, ispTelecom);
            if (dynamicIPList.length > 0) await addNodesFromList(dynamicIPList);
        } catch (error) { }
    }

    if (egi) {
        try {
            let allURLsForIP = [];
            if (extraIPUrls && extraIPUrls.length > 0) allURLsForIP = extraIPUrls;
            else if (piu && piu.toLowerCase().startsWith('https://')) allURLsForIP = [piu];
            
            if (allURLsForIP.length > 0) {
                const multiIPList = await fetchMultipleURLIPs(allURLsForIP, 30);
                if (multiIPList.length > 0) {
                    const hasProtocol = evEnabled || etEnabled || vmEnabled;
                    if (hasProtocol ? evEnabled : true) finalLinks.push(...generateLinksFromNewIPs(multiIPList, user, nodeDomain, wsPath, echConfig));
                }
            } else if (piu && piu.includes('\n')) {
                const 完整优选列表 = await 整理成数组(piu);
                const 优选API = [], 优选IP = [], 其他节点 = [];
                for (const 元素 of 完整优选列表) {
                    if (元素.toLowerCase().startsWith('https://')) 优选API.push(元素);
                    else if (元素.toLowerCase().includes('://')) 其他节点.push(元素);
                    else 优选IP.push(元素);
                }
                if (优选API.length > 0) {
                    const 优选API的IP = await 请求优选API(优选API);
                    优选IP.push(...优选API的IP);
                }
                if (优选IP.length > 0) {
                    const IP列表 = 优选IP.map(原始地址 => {
                        const regex = /^(\[[\da-fA-F:]+\]|[\d.]+|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*)(?::(\d+))?(?:#(.+))?$/;
                        const match = 原始地址.match(regex);
                        if (match) return { ip: match[1].replace(/[\[\]]/g, ''), port: parseInt(match[2] || 443), name: match[3] || match[1].replace(/[\[\]]/g, '') };
                        return null;
                    }).filter(item => item !== null);
                    if (IP列表.length > 0) {
                        const hasProtocol = evEnabled || etEnabled || vmEnabled;
                        if (hasProtocol ? evEnabled : true) finalLinks.push(...generateLinksFromNewIPs(IP列表, user, nodeDomain, wsPath, echConfig));
                    }
                }
            } else if (piu) {
                const newIPList = await fetchAndParseNewIPs(piu);
                if (newIPList.length > 0) {
                    const hasProtocol = evEnabled || etEnabled || vmEnabled;
                    if (hasProtocol ? evEnabled : true) finalLinks.push(...generateLinksFromNewIPs(newIPList, user, nodeDomain, wsPath, echConfig));
                }
            }
        } catch (error) { }
    }

    if (finalLinks.length === 0) {
        const errorRemark = "所有节点获取失败";
        const errorLink = `vless://00000000-0000-0000-0000-000000000000@127.0.0.1:80?encryption=none&security=none&type=ws&host=error.com&path=%2F#${encodeURIComponent(errorRemark)}`;
        finalLinks.push(errorLink);
    }

    let subscriptionContent;
    let contentType = 'text/plain; charset=utf-8';
    
    switch (target.toLowerCase()) {
        case 'clash':
        case 'clashr':
            subscriptionContent = generateClashConfig(finalLinks);
            contentType = 'text/yaml; charset=utf-8';
            break;
        case 'surge':
        case 'surge2':
        case 'surge3':
        case 'surge4':
            subscriptionContent = generateSurgeConfig(finalLinks);
            break;
        case 'quantumult':
        case 'quanx':
            subscriptionContent = generateQuantumultConfig(finalLinks);
            break;
        default:
            subscriptionContent = btoa(finalLinks.join('\n'));
    }
    
    return new Response(subscriptionContent, {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
    });
}

function generateClashConfig(links) {
    let yaml = 'port: 7890\n';
    yaml += 'socks-port: 7891\n';
    yaml += 'allow-lan: false\n';
    yaml += 'mode: rule\n';
    yaml += 'log-level: info\n\n';
    yaml += 'proxies:\n';
    
    const proxyNames = [];
    links.forEach((link, index) => {
        const name = decodeURIComponent(link.split('#')[1] || `节点${index + 1}`);
        proxyNames.push(name);
        const server = link.match(/@([^:]+):(\d+)/)?.[1] || '';
        const port = link.match(/@[^:]+:(\d+)/)?.[1] || '443';
        const uuid = link.match(/vless:\/\/([^@]+)@/)?.[1] || '';
        const tls = link.includes('security=tls');
        const path = link.match(/path=([^&#]+)/)?.[1] || '/';
        const host = link.match(/host=([^&#]+)/)?.[1] || '';
        const sni = link.match(/sni=([^&#]+)/)?.[1] || '';
        const echParam = link.match(/[?&]ech=([^&#]+)/)?.[1];
        const echDomain = echParam ? decodeURIComponent(echParam).split('+')[0] : '';
        
        yaml += `  - name: ${name}\n`;
        yaml += `    type: vless\n`;
        yaml += `    server: ${server}\n`;
        yaml += `    port: ${port}\n`;
        yaml += `    uuid: ${uuid}\n`;
        yaml += `    tls: ${tls}\n`;
        yaml += `    network: ws\n`;
        yaml += `    ws-opts:\n`;
        yaml += `      path: ${path}\n`;
        yaml += `      headers:\n`;
        yaml += `        Host: ${host}\n`;
        if (sni) yaml += `    servername: ${sni}\n`;
        if (echDomain) {
            yaml += `    ech-opts:\n`;
            yaml += `      enable: true\n`;
            yaml += `      query-server-name: ${echDomain}\n`;
        }
    });
    
    yaml += '\nproxy-groups:\n';
    yaml += '  - name: PROXY\n';
    yaml += '    type: select\n';
    yaml += `    proxies: [${proxyNames.map(n => `'${n}'`).join(', ')}]\n`;
    yaml += '\nrules:\n';
    yaml += '  - DOMAIN-SUFFIX,local,DIRECT\n';
    yaml += '  - IP-CIDR,127.0.0.0/8,DIRECT\n';
    yaml += '  - GEOIP,CN,DIRECT\n';
    yaml += '  - MATCH,PROXY\n';
    return yaml;
}

function generateSurgeConfig(links) {
    let config = '[Proxy]\n';
    links.forEach(link => {
        const name = decodeURIComponent(link.split('#')[1] || '节点');
        config += `${name} = vless, ${link.match(/@([^:]+):(\d+)/)?.[1] || ''}, ${link.match(/@[^:]+:(\d+)/)?.[1] || '443'}, username=${link.match(/vless:\/\/([^@]+)@/)?.[1] || ''}, tls=${link.includes('security=tls')}, ws=true, ws-path=${link.match(/path=([^&#]+)/)?.[1] || '/'}, ws-headers=Host:${link.match(/host=([^&#]+)/)?.[1] || ''}\n`;
    });
    config += '\n[Proxy Group]\nPROXY = select, ' + links.map((_, i) => decodeURIComponent(links[i].split('#')[1] || `节点${i + 1}`)).join(', ') + '\n';
    return config;
}

function generateQuantumultConfig(links) {
    return btoa(links.join('\n'));
}

function generateHomePage(scuValue) {
    const scu = scuValue || 'https://url.v1.mk/sub';
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <title>服务器优选工具</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(180deg, #f5f5f7 0%, #ffffff 50%, #fafafa 100%);
            color: #1d1d1f; min-height:100vh; overflow-x:hidden;
            padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
        }
        .container { max-width:620px; margin:0 auto; padding:20px; }
        .header { text-align:center; padding:44px 20px 28px; }
        .header h1 { font-size:38px; font-weight:700; letter-spacing:-0.3px; color:#1d1d1f; margin-bottom:8px; }
        .header p { font-size:16px; color:#86868b; }
        .section-title {
            font-size:12px; font-weight:700; color:#86868b; text-transform:uppercase;
            letter-spacing:0.8px; padding:0 4px 8px; margin-top:4px;
        }
        .card {
            background:rgba(255,255,255,0.78); backdrop-filter:blur(30px) saturate(200%);
            -webkit-backdrop-filter:blur(30px) saturate(200%);
            border-radius:24px; padding:28px; margin-bottom:20px;
            box-shadow:0 4px 24px rgba(0,0,0,0.07),0 1px 3px rgba(0,0,0,0.05);
            border:0.5px solid rgba(0,0,0,0.06);
        }
        .form-group { margin-bottom:22px; }
        .form-group:last-child { margin-bottom:0; }
        .form-group > label {
            display:block; font-size:12px; font-weight:600; color:#86868b;
            margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;
        }
        .form-group input, .form-group textarea {
            width:100%; padding:13px 15px; font-size:16px; color:#1d1d1f;
            background:rgba(142,142,147,0.12); border:2px solid transparent;
            border-radius:12px; outline:none;
            transition:all 0.2s cubic-bezier(0.4,0,0.2,1); -webkit-appearance:none;
        }
        .form-group textarea {
            min-height:96px; resize:vertical; font-size:13px;
            font-family:'SF Mono','Menlo','Courier New',monospace; line-height:1.5;
        }
        .form-group input:focus, .form-group textarea:focus {
            background:rgba(142,142,147,0.18); border-color:#007AFF;
        }
        .form-group input::placeholder, .form-group textarea::placeholder { color:#aeaeb2; }
        .form-group small { display:block; margin-top:7px; color:#86868b; font-size:12px; line-height:1.5; }
        .form-group input:disabled, .form-group textarea:disabled { opacity:0.38; pointer-events:none; }
        .divider { height:0.5px; background:rgba(0,0,0,0.08); margin:4px -28px 20px; }
        .node-source-box {
            background:rgba(88,86,214,0.06); border:1.5px solid rgba(88,86,214,0.18);
            border-radius:16px; padding:18px; margin-bottom:0; transition: border-color 0.2s;
        }
        .node-source-box.active-mode { background:rgba(88,86,214,0.1); border-color:rgba(88,86,214,0.4); }
        .node-source-label {
            font-size:12px; font-weight:700; color:#5856D6; text-transform:uppercase;
            letter-spacing:0.6px; margin-bottom:12px; display:flex; align-items:center; gap:8px;
        }
        .node-mode-badge {
            display:inline-block; padding:2px 8px; background:#5856D6; color:#fff;
            border-radius:8px; font-size:11px; font-weight:600;
        }
        .list-item {
            display:flex; align-items:center; justify-content:space-between;
            padding:14px 0; min-height:50px; cursor:pointer;
            border-bottom:0.5px solid rgba(0,0,0,0.08); transition:background-color 0.15s ease;
        }
        .list-item:last-child { border-bottom:none; }
        .list-item:active { background:rgba(142,142,147,0.08); margin:0 -28px; padding-left:28px; padding-right:28px; }
        .list-item-label { font-size:16px; font-weight:400; color:#1d1d1f; flex:1; }
        .list-item-description { font-size:12px; color:#86868b; margin-top:3px; line-height:1.4; }
        .list-item.disabled { opacity:0.35; pointer-events:none; }
        .switch {
            position:relative; width:51px; height:31px; background:rgba(142,142,147,0.3); border-radius:16px;
            transition:background 0.3s cubic-bezier(0.4,0,0.2,1); cursor:pointer; flex-shrink:0;
        }
        .switch.active { background:#34C759; }
        .switch::after {
            content:''; position:absolute; top:2px; left:2px; width:27px; height:27px;
            background:#fff; border-radius:50%; transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);
            box-shadow:0 2px 6px rgba(0,0,0,0.15),0 1px 2px rgba(0,0,0,0.1);
        }
        .switch.active::after { transform:translateX(20px); }
        .btn {
            width:100%; padding:15px; font-size:16px; font-weight:600; color:#fff;
            background:#007AFF; border:none; border-radius:14px; cursor:pointer;
            transition:all 0.2s cubic-bezier(0.4,0,0.2,1); margin-top:8px;
            -webkit-appearance:none; box-shadow:0 4px 12px rgba(0,122,255,0.25);
        }
        .btn:hover { background:#0051D5; box-shadow:0 6px 16px rgba(0,122,255,0.3); }
        .btn:active { transform:scale(0.97); }
        .btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; }
        .client-btn {
            padding:11px 14px; font-size:14px; font-weight:500; color:#007AFF;
            background:rgba(0,122,255,0.1); border:1px solid rgba(0,122,255,0.2);
            border-radius:12px; cursor:pointer; transition:all 0.2s cubic-bezier(0.4,0,0.2,1);
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0;
        }
        .client-btn:active { transform:scale(0.97); background:rgba(0,122,255,0.2); }
        .client-btn.node-mode { color:#5856D6; background:rgba(88,86,214,0.1); border-color:rgba(88,86,214,0.25); }
        .url-list-item { display:flex; gap:8px; margin-bottom:8px; align-items:center; }
        .url-list-item input {
            flex:1; padding:10px 12px; font-size:13px; color:#1d1d1f;
            background:rgba(142,142,147,0.12); border:2px solid transparent; border-radius:10px; outline:none;
        }
        .url-list-item input:focus { background:rgba(142,142,147,0.18); border-color:#007AFF; }
        .url-list-item .remove-btn {
            width:32px; height:32px; border:none; background:rgba(255,59,48,0.1); color:#FF3B30;
            border-radius:8px; cursor:pointer; font-size:18px; display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .url-list-item .remove-btn:active { background:rgba(255,59,48,0.22); }
        .add-url-btn {
            width:100%; padding:9px; font-size:13px; font-weight:600; color:#007AFF;
            background:rgba(0,122,255,0.07); border:1.5px dashed rgba(0,122,255,0.3);
            border-radius:10px; cursor:pointer; transition:all 0.15s; margin-top:2px;
        }
        .add-url-btn:hover { background:rgba(0,122,255,0.12); }
        .add-url-btn.purple { color:#5856D6; background:rgba(88,86,214,0.07); border-color:rgba(88,86,214,0.3); }
        .add-url-btn.purple:hover { background:rgba(88,86,214,0.12); }
        .checkbox-label {
            display:flex; align-items:center; cursor:pointer; font-size:16px; padding:7px 0;
        }
        .checkbox-label input[type="checkbox"] { margin-right:11px; width:22px; height:22px; cursor:pointer; flex-shrink:0; }
        .result-url {
            margin-top:12px; padding:11px 13px; background:rgba(0,122,255,0.08); border-radius:10px;
            font-size:12px; color:#007aff; word-break:break-all; line-height:1.5;
        }
        .result-url.purple { background:rgba(88,86,214,0.08); color:#5856D6; }
        .badge {
            display:inline-block; margin-left:7px; padding:2px 8px; background:rgba(0,122,255,0.12);
            color:#007AFF; border-radius:9px; font-size:11px; font-weight:600; vertical-align:middle;
        }
        .badge.green { background:rgba(52,199,89,0.12); color:#34C759; }
        .footer { text-align:center; padding:28px 20px; color:#86868b; font-size:13px; }
        .footer a { color:#007AFF; text-decoration:none; font-weight:500; }
        @media (max-width:480px) {
            .header h1 { font-size:32px; }
            .client-btn { font-size:12px; padding:10px 11px; }
        }
        @media (prefers-color-scheme: dark) {
            body { background:linear-gradient(180deg,#000 0%,#1c1c1e 50%,#2c2c2e 100%); color:#f5f5f7; }
            .card { background:rgba(28,28,30,0.78); border:0.5px solid rgba(255,255,255,0.1); box-shadow:0 4px 24px rgba(0,0,0,0.35); }
            .form-group input, .form-group textarea { background:rgba(142,142,147,0.2); color:#f5f5f7; }
            .form-group input:focus, .form-group textarea:focus { background:rgba(142,142,147,0.26); border-color:#5ac8fa; }
            .list-item { border-bottom-color:rgba(255,255,255,0.09); }
            .list-item-label { color:#f5f5f7; }
            .list-item:active { background:rgba(255,255,255,0.07); }
            .switch { background:rgba(142,142,147,0.38); }
            .switch.active { background:#30d158; }
            .divider { background:rgba(255,255,255,0.09); }
            .node-source-box { background:rgba(88,86,214,0.08); border-color:rgba(88,86,214,0.25); }
            .node-source-box.active-mode { background:rgba(88,86,214,0.14); border-color:rgba(88,86,214,0.5); }
            .url-list-item input { background:rgba(142,142,147,0.2); color:#f5f5f7; }
            .checkbox-label { color:#f5f5f7; }
            .client-btn { background:rgba(0,122,255,0.14)!important; border-color:rgba(0,122,255,0.3)!important; color:#5ac8fa!important; }
            .client-btn.node-mode { color:#a29bf4!important; background:rgba(88,86,214,0.16)!important; border-color:rgba(88,86,214,0.35)!important; }
            .footer a { color:#5ac8fa!important; }
            .result-url { background:rgba(0,122,255,0.12); }
            .result-url.purple { background:rgba(88,86,214,0.14); color:#a29bf4; }
        }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>服务器优选工具</h1>
        <p>智能优选 • 一键生成</p>
    </div>

    <div class="section-title">订阅生成</div>
    <div class="card">
        <div class="form-group">
            <label>Worker 域名</label>
            <input type="text" id="domain" placeholder="请输入您部署的 Worker 域名">
        </div>
        <div class="form-group">
            <label>UUID / Password</label>
            <input type="text" id="uuid" placeholder="请输入 UUID 或 Password">
        </div>
        <div class="form-group">
            <label>WebSocket 路径（可选）</label>
            <input type="text" id="customPath" value="/" placeholder="留空使用默认 /">
            <small>自定义 WS 路径，如 /v2ray 或 /</small>
        </div>

        <div class="divider"></div>

        <div class="list-item" id="rowDomain" onclick="toggleSwitch('switchDomain')">
            <div><div class="list-item-label">启用优选域名</div></div>
            <div class="switch active" id="switchDomain"></div>
        </div>
        <div class="form-group" style="margin-top:12px; padding:14px; background:rgba(52,199,89,0.06); border-radius:14px; border:1px solid rgba(52,199,89,0.18);">
            <label style="color:#34C759;">从 URL 获取优选域名 <span class="badge green">新</span></label>
            <div id="domainUrlList">
                <div class="url-list-item">
                    <input type="text" placeholder="每行一个域名的文本 URL（可选）" data-domain-url>
                    <button class="remove-btn" onclick="removeUrlItem(this)">×</button>
                </div>
            </div>
            <button class="add-url-btn" style="color:#34C759;border-color:rgba(52,199,89,0.3);background:rgba(52,199,89,0.07);" onclick="addUrlToList('domainUrlList','输入包含域名的文本URL','data-domain-url')">＋ 添加域名 URL</button>
        </div>

        <div class="list-item" id="rowIP" onclick="toggleSwitch('switchIP')" style="margin-top:8px;">
            <div><div class="list-item-label">启用 wetest 优选IP</div></div>
            <div class="switch active" id="switchIP"></div>
        </div>
        <div class="list-item" id="rowGitHub" onclick="toggleSwitch('switchGitHub')">
            <div><div class="list-item-label">启用自定义优选IP <span class="badge">最多30</span></div></div>
            <div class="switch active" id="switchGitHub"></div>
        </div>
        <div class="form-group" style="margin-top:12px; padding:14px; background:rgba(0,122,255,0.05); border-radius:14px; border:1px solid rgba(0,122,255,0.14);">
            <label style="color:#007AFF;">优选IP来源 URL <span class="badge">新·多URL</span></label>
            <div id="ipUrlList">
                <div class="url-list-item">
                    <input type="text" placeholder="留空则使用默认地址" data-ip-url>
                    <button class="remove-btn" onclick="removeUrlItem(this)">×</button>
                </div>
            </div>
            <button class="add-url-btn" onclick="addUrlToList('ipUrlList','输入优选IP来源URL','data-ip-url')">＋ 添加 IP 来源 URL</button>
            <small style="margin-top:6px;">支持多个URL并发拉取，自动去重，上限30个</small>
        </div>

        <div class="divider"></div>

        <div id="protocolSection">
            <div style="font-size:12px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">协议选择</div>
            <div class="list-item" id="rowVL" onclick="toggleSwitch('switchVL')">
                <div><div class="list-item-label">VLESS</div></div>
                <div class="switch active" id="switchVL"></div>
            </div>
            <div class="list-item" id="rowTJ" onclick="toggleSwitch('switchTJ')">
                <div><div class="list-item-label">Trojan</div></div>
                <div class="switch" id="switchTJ"></div>
            </div>
            <div class="list-item" id="rowVM" onclick="toggleSwitch('switchVM')">
                <div><div class="list-item-label">VMess</div></div>
                <div class="switch" id="switchVM"></div>
            </div>
        </div>

        <div class="divider"></div>

        <div class="node-source-box" id="nodeSourceBox">
            <div class="node-source-label">
                节点来源
                <span class="node-mode-badge" id="nodeModeBadge" style="display:none;">节点替换模式已激活</span>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
                <label style="color:#5856D6;">从订阅URL自动拉取节点</label>
                <div id="nodeUrlList">
                    <div class="url-list-item">
                        <input type="text" placeholder="输入节点订阅链接URL（支持 base64 或明文）" data-node-url oninput="onNodeInputChange()">
                        <button class="remove-btn" onclick="removeUrlItem(this); onNodeInputChange()">×</button>
                    </div>
                </div>
                <button class="add-url-btn purple" onclick="addUrlToList('nodeUrlList','输入订阅URL','data-node-url',true)">＋ 添加订阅 URL</button>
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label style="color:#5856D6;">手动输入节点</label>
                <textarea id="manualNodes" placeholder="粘贴节点链接，每行一个&#10;支持 vless:// / trojan:// / vmess://" oninput="onNodeInputChange()"></textarea>
                <small>填入节点后，将保留原始参数，仅替换连接IP为优选IP。</small>
            </div>
        </div>

        <div class="divider"></div>

        <div class="form-group">
            <label>客户端选择</label>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:9px;margin-top:8px;" id="clientBtnGrid">
                <button type="button" class="client-btn" data-client="clash"    data-name="CLASH">CLASH</button>
                <button type="button" class="client-btn" data-client="clash"    data-name="STASH">STASH</button>
                <button type="button" class="client-btn" data-client="surge"    data-name="SURGE">SURGE</button>
                <button type="button" class="client-btn" data-client="sing-box" data-name="SING-BOX">SING-BOX</button>
                <button type="button" class="client-btn" data-client="loon"     data-name="LOON">LOON</button>
                <button type="button" class="client-btn" data-client="quanx"    data-name="QUANTUMULT X" style="font-size:12px;">QUANTUMULT X</button>
                <button type="button" class="client-btn" data-client="v2ray"    data-name="V2RAY">V2RAY</button>
                <button type="button" class="client-btn" data-client="v2ray"    data-name="V2RAYNG">V2RAYNG</button>
                <button type="button" class="client-btn" data-client="v2ray"    data-name="NEKORAY">NEKORAY</button>
                <button type="button" class="client-btn" data-client="v2ray"    data-name="Shadowrocket" style="font-size:12px;">Shadowrocket</button>
            </div>
            <div class="result-url" id="subUrlDisplay" style="display:none;"></div>
        </div>

        <div class="divider"></div>

        <div class="form-group">
            <label>IP 版本</label>
            <div style="display:flex;gap:18px;margin-top:8px;">
                <label class="checkbox-label"><input type="checkbox" id="ipv4Enabled" checked><span>IPv4</span></label>
                <label class="checkbox-label"><input type="checkbox" id="ipv6Enabled" checked><span>IPv6</span></label>
            </div>
        </div>

        <div class="form-group">
            <label>运营商</label>
            <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;">
                <label class="checkbox-label"><input type="checkbox" id="ispMobile" checked><span>移动</span></label>
                <label class="checkbox-label"><input type="checkbox" id="ispUnicom" checked><span>联通</span></label>
                <label class="checkbox-label"><input type="checkbox" id="ispTelecom" checked><span>电信</span></label>
            </div>
        </div>

        <div class="list-item" id="rowTLS" onclick="toggleSwitch('switchTLS')">
            <div>
                <div class="list-item-label">仅 TLS 节点</div>
                <div class="list-item-description">只生成/保留带 TLS 的节点</div>
            </div>
            <div class="switch" id="switchTLS"></div>
        </div>

        <div class="list-item" id="rowECH" onclick="toggleSwitch('switchECH')">
            <div>
                <div class="list-item-label">ECH</div>
                <div class="list-item-description">携带 ECH 参数，节点来源模式下不可用</div>
            </div>
            <div class="switch" id="switchECH"></div>
        </div>
        <div class="form-group" id="echOptionsGroup" style="display:none;">
            <label>ECH 自定义 DNS（可选）</label>
            <input type="text" id="customDNS" placeholder="例如: https://dns.joeyblog.eu.org/joeyblog" style="font-size:13px;">
            <label style="margin-top:12px;display:block;">ECH 域名（可选）</label>
            <input type="text" id="customECHDomain" placeholder="例如: cloudflare-ech.com" style="font-size:13px;">
        </div>
    </div>
    <div class="footer">
        <p>服务器优选工具 • 节点生成 & IP替换</p>
        <div style="margin-top:18px;display:flex;justify-content:center;gap:24px;flex-wrap:wrap;">
            <a href="https://github.com/byJoey/yx-auto" target="_blank">GitHub 项目</a>
            <a href="https://www.youtube.com/@joeyblog" target="_blank">YouTube @joeyblog</a>
        </div>
    </div>
</div>

<script>
    let switches = {
        switchDomain: true, switchIP: true, switchGitHub: true,
        switchVL: true, switchTJ: false, switchVM: false,
        switchTLS: false, switchECH: false
    };
    let nodeModeActive = false;

    function toggleSwitch(id) {
        const el = document.getElementById(id);
        if (!el || el.closest('.list-item')?.classList.contains('disabled')) return;
        switches[id] = !switches[id];
        el.classList.toggle('active');
        if (id === 'switchECH') {
            document.getElementById('echOptionsGroup').style.display = switches.switchECH ? 'block' : 'none';
            if (switches.switchECH && !switches.switchTLS) {
                switches.switchTLS = true;
                document.getElementById('switchTLS').classList.add('active');
            }
        }
    }

    function onNodeInputChange() {
        const urlInputs = Array.from(document.querySelectorAll('[data-node-url]'));
        const hasUrl = urlInputs.some(i => i.value.trim().startsWith('http'));
        const hasManual = document.getElementById('manualNodes').value.trim().length > 0;
        const active = hasUrl || hasManual;
        if (active === nodeModeActive) return;
        nodeModeActive = active;
        applyNodeMode(active);
    }

    function applyNodeMode(active) {
        ['rowVL','rowTJ','rowVM'].forEach(id => { document.getElementById(id)?.classList.toggle('disabled', active); });
        const rowECH = document.getElementById('rowECH');
        rowECH.classList.toggle('disabled', active);
        if (active && switches.switchECH) {
            switches.switchECH = false;
            document.getElementById('switchECH').classList.remove('active');
            document.getElementById('echOptionsGroup').style.display = 'none';
        }
        document.getElementById('nodeSourceBox').classList.toggle('active-mode', active);
        document.getElementById('nodeModeBadge').style.display = active ? 'inline-block' : 'none';
        document.querySelectorAll('#clientBtnGrid .client-btn').forEach(btn => { btn.classList.toggle('node-mode', active); });
        const disp = document.getElementById('subUrlDisplay');
        if (active) disp.classList.add('purple'); else disp.classList.remove('purple');
    }

    function removeUrlItem(btn) {
        const item = btn.closest('.url-list-item');
        const list = item.parentElement;
        if (list.querySelectorAll('.url-list-item').length > 1) {
            item.remove();
        } else {
            item.querySelector('input').value = '';
        }
        if (item.querySelector('[data-node-url]')) onNodeInputChange();
    }

    function addUrlToList(listId, placeholder, dataAttr, isNodeUrl = false) {
        const list = document.getElementById(listId);
        const div = document.createElement('div');
        div.className = 'url-list-item';
        const onInput = isNodeUrl ? ' oninput="onNodeInputChange()"' : '';
        div.innerHTML = \`<input type="text" placeholder="\${placeholder}" \${dataAttr}="\${dataAttr}"\${onInput}>
            <button class="remove-btn" onclick="removeUrlItem(this)\${isNodeUrl ? '; onNodeInputChange()' : ''}">×</button>\`;
        list.appendChild(div);
        div.querySelector('input').focus();
    }

    function getUrlsFromAttr(attr) {
        return Array.from(document.querySelectorAll(\`[\${attr}]\`))
            .map(i => i.value.trim()).filter(v => v.length > 0);
    }

    const SUB_CONVERTER_URL = "${ scu }";

    function tryOpenApp(scheme, fallback, timeout = 2500) {
        let opened = false, done = false;
        const t0 = Date.now();
        const onBlur = () => { if (Date.now()-t0 < 3000) opened = true; };
        const onHide = () => { if (Date.now()-t0 < 3000) opened = true; };
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onHide);
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'display:none;width:1px;height:1px;';
        iframe.src = scheme;
        document.body.appendChild(iframe);
        setTimeout(() => {
            iframe.parentNode?.removeChild(iframe);
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onHide);
            if (!done) { done = true; if (!opened && fallback) fallback(); }
        }, timeout);
    }

    function copyAndAlert(text, name) {
        navigator.clipboard.writeText(text).then(() => alert(name + ' 订阅链接已复制')).catch(() => alert('链接：' + text));
    }

    document.getElementById('clientBtnGrid').addEventListener('click', function(e) {
        const btn = e.target.closest('.client-btn');
        if (!btn) return;
        const clientType = btn.dataset.client;
        const clientName = btn.dataset.name;
        if (nodeModeActive) generateNodeModeLink(clientType, clientName);
        else generateStandardLink(clientType, clientName);
    });

    function generateStandardLink(clientType, clientName) {
        const domain = document.getElementById('domain').value.trim();
        const uuid = document.getElementById('uuid').value.trim();
        if (!domain || !uuid) { alert('请先填写域名和 UUID/Password'); return; }
        if (!switches.switchVL && !switches.switchTJ && !switches.switchVM) {
            alert('请至少选择一个协议（VLESS / Trojan / VMess）'); return;
        }
        const customPath = document.getElementById('customPath').value.trim() || '/';
        const ipUrls = getUrlsFromAttr('data-ip-url');
        const domainUrls = getUrlsFromAttr('data-domain-url');
        const base = window.location.origin;
        let subUrl = \`\${base}/\${uuid}/sub?domain=\${encodeURIComponent(domain)}\`
            + \`&epd=\${switches.switchDomain?'yes':'no'}\`
            + \`&epi=\${switches.switchIP?'yes':'no'}\`
            + \`&egi=\${switches.switchGitHub?'yes':'no'}\`;
        if (ipUrls.length) subUrl += \`&piuList=\${encodeURIComponent(ipUrls.join(','))}\`;
        if (domainUrls.length) subUrl += \`&domainUrls=\${encodeURIComponent(domainUrls.join(','))}\`;
        if (switches.switchVL) subUrl += '&ev=yes';
        if (switches.switchTJ) subUrl += '&et=yes';
        if (switches.switchVM) subUrl += '&mess=yes';
        if (!document.getElementById('ipv4Enabled').checked) subUrl += '&ipv4=no';
        if (!document.getElementById('ipv6Enabled').checked) subUrl += '&ipv6=no';
        if (!document.getElementById('ispMobile').checked) subUrl += '&ispMobile=no';
        if (!document.getElementById('ispUnicom').checked) subUrl += '&ispUnicom=no';
        if (!document.getElementById('ispTelecom').checked) subUrl += '&ispTelecom=no';
        if (switches.switchTLS) subUrl += '&dkby=yes';
        if (switches.switchECH) {
            subUrl += '&ech=yes';
            const dns = document.getElementById('customDNS').value.trim();
            const ech = document.getElementById('customECHDomain').value.trim();
            if (dns) subUrl += \`&customDNS=\${encodeURIComponent(dns)}\`;
            if (ech) subUrl += \`&customECHDomain=\${encodeURIComponent(ech)}\`;
        }
        if (customPath !== '/') subUrl += \`&path=\${encodeURIComponent(customPath)}\`;
        dispatchClientLink(subUrl, clientType, clientName);
    }

    function generateNodeModeLink(clientType, clientName) {
        const manualText = document.getElementById('manualNodes').value.trim();
        const nodeUrls = getUrlsFromAttr('data-node-url').filter(u => u.startsWith('http'));
        const domainUrls = getUrlsFromAttr('data-domain-url');
        const ipUrls = getUrlsFromAttr('data-ip-url');

        const manualLines = manualText
            ? manualText.split('\\n').map(l=>l.trim()).filter(l=>
                l.startsWith('vless://') || l.startsWith('trojan://') || l.startsWith('vmess://'))
            : [];

        const base = window.location.origin;
        let subUrl = \`\${base}/replace-sub?target=base64\`;

        if (manualLines.length > 0) {
            try {
                const b64 = btoa(unescape(encodeURIComponent(manualLines.join('\\n'))));
                subUrl += \`&nodes=\${encodeURIComponent(b64)}\`;
            } catch(e) {}
        }
        if (nodeUrls.length > 0) {
            subUrl += \`&nodeUrlList=\${encodeURIComponent(nodeUrls.join(','))}\`;
        }
        if (!manualLines.length && !nodeUrls.length) {
            alert('请输入节点信息（URL 或手动粘贴）');
            return;
        }

        subUrl += \`&epd=\${switches.switchDomain?'yes':'no'}\`;
        if (ipUrls.length) subUrl += \`&piuList=\${encodeURIComponent(ipUrls.join(','))}\`;
        if (domainUrls.length) subUrl += \`&domainUrls=\${encodeURIComponent(domainUrls.join(','))}\`;
        if (!document.getElementById('ipv4Enabled').checked) subUrl += '&ipv4=no';
        if (!document.getElementById('ipv6Enabled').checked) subUrl += '&ipv6=no';
        if (!document.getElementById('ispMobile').checked) subUrl += '&ispMobile=no';
        if (!document.getElementById('ispUnicom').checked) subUrl += '&ispUnicom=no';
        if (!document.getElementById('ispTelecom').checked) subUrl += '&ispTelecom=no';
        if (switches.switchTLS) subUrl += '&dkby=yes';
        if (!document.getElementById('replaceUseWetest')?.checked ?? false) subUrl += '&useWetest=no';

        dispatchClientLink(subUrl, clientType, clientName, true);
    }

    function dispatchClientLink(subUrl, clientType, clientName, isNodeMode = false) {
        let finalUrl = subUrl;
        let scheme = '';

        if (clientType === 'v2ray') {
            showSubUrl(finalUrl, isNodeMode);
            if (clientName === 'V2RAY') copyAndAlert(finalUrl, clientName);
            else if (clientName === 'Shadowrocket') { scheme = 'shadowrocket://add/' + encodeURIComponent(finalUrl); tryOpenApp(scheme, () => copyAndAlert(finalUrl, clientName)); }
            else if (clientName === 'V2RAYNG') { scheme = 'v2rayng://install?url=' + encodeURIComponent(finalUrl); tryOpenApp(scheme, () => copyAndAlert(finalUrl, clientName)); }
            else if (clientName === 'NEKORAY') { scheme = 'nekoray://install-config?url=' + encodeURIComponent(finalUrl); tryOpenApp(scheme, () => copyAndAlert(finalUrl, clientName)); }
        } else {
            const targetParam = clientType;
            finalUrl = SUB_CONVERTER_URL + '?target=' + targetParam + '&url=' + encodeURIComponent(subUrl) + '&insert=false&emoji=true&list=false&xudp=false&udp=false&tfo=false&expand=true&scv=false&fdn=false&new_name=true';
            showSubUrl(finalUrl, isNodeMode);
            if (clientType === 'clash') scheme = (clientName === 'STASH' ? 'stash://install?url=' : 'clash://install-config?url=') + encodeURIComponent(finalUrl);
            else if (clientType === 'surge') scheme = 'surge:///install-config?url=' + encodeURIComponent(finalUrl);
            else if (clientType === 'sing-box') scheme = 'sing-box://install-config?url=' + encodeURIComponent(finalUrl);
            else if (clientType === 'loon') scheme = 'loon://install?url=' + encodeURIComponent(finalUrl);
            else if (clientType === 'quanx') scheme = 'quantumult-x://install-config?url=' + encodeURIComponent(finalUrl);
            
            if (scheme) tryOpenApp(scheme, () => copyAndAlert(finalUrl, clientName));
            else copyAndAlert(finalUrl, clientName);
        }
    }

    function showSubUrl(url, isNodeMode) {
        const el = document.getElementById('subUrlDisplay');
        el.textContent = url;
        el.style.display = 'block';
        el.className = 'result-url' + (isNodeMode ? ' purple' : '');
    }
</script>
</body>
</html>`;
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        
        if (path === '/' || path === '') {
            const scuValue = env?.scu || scu;
            return new Response(generateHomePage(scuValue), {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }
        
        if (path === '/test-optimize-api') {
            if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
            const apiUrl = url.searchParams.get('url');
            const port = url.searchParams.get('port') || '443';
            const timeout = parseInt(url.searchParams.get('timeout') || '3000');
            if (!apiUrl) return new Response(JSON.stringify({ success: false, error: '缺少url参数' }), { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
            try {
                const results = await 请求优选API([apiUrl], port, timeout);
                return new Response(JSON.stringify({ success: true, results: results, total: results.length, message: `成功获取 ${results.length} 个优选IP` }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
            } catch (error) { return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); }
        }

        // ============================================================
        // 节点替换重构：增强安全Base64处理，避免中途抛出500导致转换崩溃
        // ============================================================
        if (path === '/replace-sub') {
            if (request.method === 'OPTIONS') {
                return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
            }
            
            const nodesB64 = url.searchParams.get('nodes');
            const nodeUrlListStr = url.searchParams.get('nodeUrlList');
            const piuListStr = url.searchParams.get('piuList');
            const ipSources = piuListStr ? piuListStr.split(',').map(u => u.trim()).filter(u => u.startsWith('http')) : [];

            let originalNodes = [];

            // 1. 解码前端传入的 Base64 节点
            if (nodesB64) {
                try {
                    let safeBase64 = nodesB64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
                    while (safeBase64.length % 4) safeBase64 += '=';
                    const decodedBytes = atob(safeBase64);
                    let decodedStr = decodedBytes;
                    try { decodedStr = decodeURIComponent(escape(decodedBytes)); } catch(e) {}
                    const parsed = decodedStr.split('\n').map(l => l.trim()).filter(l => l &&
                        (l.startsWith('vless://') || l.startsWith('trojan://') || l.startsWith('vmess://'))
                    );
                    originalNodes.push(...parsed);
                } catch(e) {}
            }

            // 2. 从订阅链接拉取
            if (nodeUrlListStr) {
                const nodeUrls = nodeUrlListStr.split(',').map(u => u.trim()).filter(u => u.startsWith('http'));
                for (const nu of nodeUrls) {
                    const fetched = await fetchNodesFromURL(nu);
                    originalNodes.push(...fetched);
                }
            }

            // 去重
            originalNodes = [...new Set(originalNodes)];

            return await handleReplaceIPSubscription(request, originalNodes, ipSources, 30);
        }

        if (path === '/api/fetch-domains') {
            const domainUrl = url.searchParams.get('url');
            if (!domainUrl) return new Response(JSON.stringify({ success: false, error: '缺少url参数' }), { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
            try {
                const domains = await fetchCustomDomains(domainUrl);
                return new Response(JSON.stringify({ success: true, domains: domains.map(d => d.ip), total: domains.length }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
            } catch (e) { return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); }
        }

        if (path === '/api/fetch-ips') {
            const urlsStr = url.searchParams.get('urls');
            if (!urlsStr) return new Response(JSON.stringify({ success: false, error: '缺少urls参数' }), { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
            try {
                const urls = urlsStr.split(',').map(u => u.trim()).filter(u => u.startsWith('http'));
                const ipList = await fetchMultipleURLIPs(urls, 30);
                return new Response(JSON.stringify({ success: true, ips: ipList, total: ipList.length }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
            } catch (e) { return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); }
        }
        
        const pathMatch = path.match(/^\/([^\/]+)\/sub$/);
        if (pathMatch) {
            const uuid = pathMatch[1];
            const domain = url.searchParams.get('domain');
            if (!domain) return new Response('缺少域名参数', { status: 400 });
            
            epd = url.searchParams.get('epd') !== 'no';
            epi = url.searchParams.get('epi') !== 'no';
            egi = url.searchParams.get('egi') !== 'no';
            const piu = url.searchParams.get('piu') || defaultIPURL;
            
            const piuListStr = url.searchParams.get('piuList');
            const extraIPUrls = piuListStr ? piuListStr.split(',').map(u => u.trim()).filter(u => u.startsWith('http')) : [];
            
            const domainUrlsStr = url.searchParams.get('domainUrls');
            const customDomainUrls = domainUrlsStr ? domainUrlsStr.split(',').map(u => u.trim()).filter(u => u.startsWith('http')) : [];
            
            const evEnabled = url.searchParams.get('ev') === 'yes' || (url.searchParams.get('ev') === null && ev);
            const etEnabled = url.searchParams.get('et') === 'yes';
            const vmEnabled = url.searchParams.get('mess') === 'yes';
            
            const ipv4Enabled = url.searchParams.get('ipv4') !== 'no';
            const ipv6Enabled = url.searchParams.get('ipv6') !== 'no';
            
            const ispMobile = url.searchParams.get('ispMobile') !== 'no';
            const ispUnicom = url.searchParams.get('ispUnicom') !== 'no';
            const ispTelecom = url.searchParams.get('ispTelecom') !== 'no';
            
            let disableNonTLS = url.searchParams.get('dkby') === 'yes';
            const echParam = url.searchParams.get('ech');
            const echEnabled = echParam === 'yes' || (echParam === null && enableECH);
            if (echEnabled) disableNonTLS = true;
            const customDNSParam = url.searchParams.get('customDNS') || customDNS;
            const customECHDomainParam = url.searchParams.get('customECHDomain') || customECHDomain;
            const echConfig = echEnabled ? `${customECHDomainParam}+${customDNSParam}` : null;

            const customPath = url.searchParams.get('path') || '/';

            return await handleSubscriptionRequest(
                request, uuid, domain, piu, ipv4Enabled, ipv6Enabled, ispMobile, ispUnicom, ispTelecom,
                evEnabled, etEnabled, vmEnabled, disableNonTLS, customPath, echConfig, customDomainUrls, extraIPUrls
            );
        }
        
        return new Response('Not Found', { status: 404 });
    }
};
