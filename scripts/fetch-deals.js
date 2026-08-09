import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DOMAIN = 'https://steam-deals-site.pages.dev'; 

// 【不変値】亮さんのAwin Publisher ID
const AWIN_PUBLISHER_ID = '3028347';

// storeID=15 (Fanatical) 指定
const API_URL = 'https://www.cheapshark.com/api/1.0/deals?storeID=15&lowerPrice=0.50&upperPrice=50&sortBy=Savings';

/**
 * CheapSharkのクッションページを解析し、
 * 「他人のID（横取り）」を排除した「純粋なFanatical直URL」を抽出して亮さんのアフィリンクを再構築する
 */
async function resolveAffiliateLink(dealID) {
  const fallbackUrl = `https://www.cheapshark.com/redirect?dealID=${dealID}`;
  try {
    // 実際にブラウザが踏むリダイレクトを裏側で辿る（遷移はさせずヘッダだけ抜く）
    const response = await fetch(fallbackUrl, {
      redirect: 'manual',
      headers: { 'User-Agent': 'SteamDealsBot/1.0' }
    });
    
    const location = response.headers.get('location');
    
    // CheapSharkがAwinリンクを返してきた場合、中身を分解して亮さんのIDにすり替える
    if (location && location.includes('awin1.com')) {
      const url = new URL(location);
      const awinmid = url.searchParams.get('awinmid'); // 最新のストアID
      const ued = url.searchParams.get('ued');         // CheapSharkが隠しているFanatical直URL
      
      if (awinmid && ued) {
        // 亮さんのPublisherID(3028347)と、直URLを結合して正しいアフィリンクを生成
        return `https://www.awin1.com/cread.php?awinmid=${awinmid}&awinaffid=${AWIN_PUBLISHER_ID}&ued=${encodeURIComponent(ued)}`;
      }
    }
  } catch (error) {
    // ネットワークエラー等は無視してフォールバックへ
  }
  // 抽出失敗時はエラーでサイトを壊さないよう、やむを得ずCheapSharkリンクへ逃がす
  return fallbackUrl;
}

async function fetchCheapSharkDeals() {
  console.log('CheapShark APIからセールデータを取得中...');
  
  try {
    const customUserAgent = 'SteamDealsBot/1.0 (https://github.com/mryo0310)';
    const curlCommand = `curl -s -L -A "${customUserAgent}" "${API_URL}"`;
    const stdout = execSync(curlCommand, { encoding: 'utf-8', timeout: 15000 });

    if (!stdout || stdout.trim().startsWith('<')) {
      throw new Error('APIからHTMLエラーレスポンスが返却されました。');
    }

    const deals = JSON.parse(stdout);

    if (!Array.isArray(deals) || deals.length === 0) {
      throw new Error('APIからの返却データが空、または配列形式ではありません。');
    }

    const top50 = deals
      .filter(deal => Math.round(parseFloat(deal.savings || 0)) < 100)
      .slice(0, 50);

    const items = [];
    let overrideCount = 0;

    console.log(`全 ${top50.length} 件のリンクからアフィリエイトIDの抽出・すり替えを実行します...`);

    // API制限（429エラー）を避けるため、1件ずつ順番にリンクを解析
    for (const deal of top50) {
      const savingsNum = Math.round(parseFloat(deal.savings || 0));
      const salePriceNum = parseFloat(deal.salePrice || 0);
      
      // ここで横取りIDを排除し、亮さんのIDリンクを生成
      const finalLink = await resolveAffiliateLink(deal.dealID);
      if (finalLink.includes(AWIN_PUBLISHER_ID)) overrideCount++;

      items.push({
        id: deal.dealID,
        title: deal.title,
        salePrice: `$${deal.salePrice}`,
        normalPrice: `$${deal.normalPrice}`,
        salePriceNum: salePriceNum,
        savingsNum: savingsNum,
        savings: `${savingsNum}% OFF`,
        thumb: deal.thumb,
        steamAppID: deal.steamAppID,
        storeID: deal.storeID,
        link: finalLink
      });
    }

    console.log(`データ構築成功: ${items.length} 件中 ${overrideCount} 件を亮さんのAwin ID (${AWIN_PUBLISHER_ID}) に書き換えました。`);
    return items;
  } catch (error) {
    console.error('CheapShark API取得エラー:', error.message || error);
    return [];
  }
}

const commonStyle = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0b0e14; color: #c5d0e6; margin: 0; padding: 0; line-height: 1.5; }
  header { background-color: #151922; padding: 20px; text-align: center; border-bottom: 1px solid #2a3245; }
  header h1 { margin: 0; font-size: 1.5rem; color: #ffffff; }
  nav.categories { background-color: #1a2332; padding: 12px; text-align: center; flex-wrap: wrap; display: flex; justify-content: center; gap: 15px; }
  nav.categories a { color: #8f9cae; text-decoration: none; font-weight: bold; font-size: 0.9rem; transition: color 0.2s; }
  nav.categories a:hover { color: #00fff0; text-decoration: underline; }
  .breadcrumb { max-width: 1200px; margin: 15px auto 0; padding: 0 20px; font-size: 0.85rem; color: #60708a; }
  .breadcrumb a { color: #00fff0; text-decoration: none; }
  .container { max-width: 1200px; margin: 20px auto; padding: 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; }
  .card { background: #151922; border-radius: 8px; border: 1px solid #2a3245; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.15s ease, box-shadow 0.15s ease; }
  .card:hover { transform: translateY(-3px); box-shadow: 0 6px 16px rgba(0,255,240,0.1); border-color: #00fff0; }
  .card-img-wrapper { width: 100%; height: 120px; background-color: #0b0e14; overflow: hidden; position: relative; }
  .card img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .badge { position: absolute; top: 8px; right: 8px; background: #e63946; color: #fff; font-weight: bold; font-size: 0.8rem; padding: 3px 8px; border-radius: 4px; }
  .card-body { padding: 14px; display: flex; flex-direction: column; flex-grow: 1; }
  .card-title { font-size: 0.95rem; font-weight: bold; margin: 0 0 10px 0; line-height: 1.3; height: 2.6em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: #ffffff; }
  .price-box { display: flex; align-items: baseline; gap: 8px; margin-top: auto; margin-bottom: 12px; }
  .sale-price { font-size: 1.2rem; color: #00fff0; font-weight: bold; }
  .normal-price { font-size: 0.85rem; color: #60708a; text-decoration: line-through; }
  .btn { display: block; text-align: center; background-color: #1b75d0; color: #ffffff; text-decoration: none; padding: 10px 0; border-radius: 4px; font-weight: bold; font-size: 0.85rem; transition: background 0.2s; }
  .btn:hover { background-color: #135ab2; }
  footer { text-align: center; padding: 25px; background: #151922; color: #60708a; margin-top: 40px; border-top: 1px solid #2a3245; font-size: 0.85rem; }
  footer a { color: #00fff0; text-decoration: none; margin: 0 10px; }
`;

function generateHTML(title, description, items, breadcrumbs) {
  const breadcrumbHTML = breadcrumbs.map((b, i) => 
    i === breadcrumbs.length - 1 ? `<span>${b.name}</span>` : `<a href="${b.path}">${b.name}</a> &gt; `
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <style>${commonStyle}</style>
</head>
<body>
  <header>
    <h1>🎮 ${title}</h1>
  </header>
  <nav class="categories">
    <a href="/">Top Deals</a>
    <a href="/huge-discounts/">80%+ OFF</a>
    <a href="/under-5-dollars/">Under $5</a>
    <a href="/under-10-dollars/">Under $10</a>
  </nav>

  <div class="breadcrumb">
    ${breadcrumbHTML}
  </div>

  <div class="container">
    <div class="grid">
      ${items.map(item => `
        <div class="card">
          <div class="card-img-wrapper">
            <img src="${item.thumb}" alt="${item.title}" loading="lazy">
            <span class="badge">${item.savings}</span>
          </div>
          <div class="card-body">
            <div class="card-title">${item.title}</div>
            <div class="price-box">
              <span class="sale-price">${item.salePrice}</span>
              <span class="normal-price">${item.normalPrice}</span>
            </div>
            <a href="${item.link}" class="btn" target="_blank" rel="noopener noreferrer">Get Deal on Store</a>
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  <footer>
    <p>
      <a href="/">Top Deals</a> | 
      <a href="/huge-discounts/">80%+ OFF</a> | 
      <a href="/under-5-dollars/">Under $5</a> | 
      <a href="/under-10-dollars/">Under $10</a>
    </p>
    <p>&copy; 2026 PC Game Deals & Historical Low Price Tracker</p>
  </footer>
</body>
</html>`;
}

async function main() {
  const items = await fetchCheapSharkDeals();

  if (items.length === 0) {
    console.error('エラー: データが取得できなかったためビルドを異常終了させます。');
    process.exit(1);
  }

  const publicDir = path.join(process.cwd(), 'public');
  const hugeDiscountsDir = path.join(publicDir, 'huge-discounts');
  const under5Dir = path.join(publicDir, 'under-5-dollars');
  const under10Dir = path.join(publicDir, 'under-10-dollars');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  if (!fs.existsSync(hugeDiscountsDir)) fs.mkdirSync(hugeDiscountsDir, { recursive: true });
  if (!fs.existsSync(under5Dir)) fs.mkdirSync(under5Dir, { recursive: true });
  if (!fs.existsSync(under10Dir)) fs.mkdirSync(under10Dir, { recursive: true });

  // 1. トップページ
  const topHTML = generateHTML(
    'PC Game Deals & Historical Low Prices',
    'Find the best PC game deals, deepest discounts, and price alerts.',
    items,
    [{ name: 'Home', path: '/' }]
  );
  fs.writeFileSync(path.join(publicDir, 'index.html'), topHTML);

  // 2. 80%以上オフ特化ページ
  const hugeDiscountItems = items.filter(item => item.savingsNum >= 80);
  const hugeDiscountsHTML = generateHTML(
    '80% OFF or More | PC Game Deals',
    'Massive discount PC games. Grab keys at 80% OFF or higher right now!',
    hugeDiscountItems.length > 0 ? hugeDiscountItems : items,
    [{ name: 'Home', path: '/' }, { name: '80%+ OFF', path: '/huge-discounts/' }]
  );
  fs.writeFileSync(path.join(hugeDiscountsDir, 'index.html'), hugeDiscountsHTML);

  // 3. 5ドル以下特化ページ
  const under5Items = items.filter(item => item.salePriceNum <= 5.00);
  const under5HTML = generateHTML(
    'Cheap PC Games Under $5',
    'Best budget PC games for under $5. Incredible game deals at bargain prices!',
    under5Items.length > 0 ? under5Items : items,
    [{ name: 'Home', path: '/' }, { name: 'Under $5', path: '/under-5-dollars/' }]
  );
  fs.writeFileSync(path.join(under5Dir, 'index.html'), under5HTML);

  // 4. 10ドル以下特化ページ
  const under10Items = items.filter(item => item.salePriceNum <= 10.00);
  const under10HTML = generateHTML(
    'PC Games Under $10',
    'Top-tier PC games under $10. High value discounts updated daily.',
    under10Items.length > 0 ? under10Items : items,
    [{ name: 'Home', path: '/' }, { name: 'Under $10', path: '/under-10-dollars/' }]
  );
  fs.writeFileSync(path.join(under10Dir, 'index.html'), under10HTML);

  // 5. SEO用 sitemap.xml & robots.txt
  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${DOMAIN}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${DOMAIN}/huge-discounts/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${DOMAIN}/under-5-dollars/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${DOMAIN}/under-10-dollars/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;
  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXML);

  const robotsTxt = `User-agent: *
Allow: /
Sitemap: ${DOMAIN}/sitemap.xml`;
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), robotsTxt);

  // JSON形式データ書き出し
  fs.writeFileSync(path.join(publicDir, 'deals.json'), JSON.stringify(items, null, 2));

  console.log('ビルド完了: 報酬すり替え防止・完全アフィリエイト化コードでの生成に成功しました。');
}

main();