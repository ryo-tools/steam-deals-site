import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { GoogleGenAI } from '@google/genai';

const AFFILIATE_ID = 'yofukashiglobal';
const DOMAIN = 'https://dlsite-auto-site-global.pages.dev';

// Gemini APIの初期化
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// テキストの不必要な改行や特殊文字をクリーンアップする関数
function cleanText(text) {
  if (!text) return '';
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// 無料のGoogle Translate APIエンドポイント（フォールバック用）
async function fallbackTranslate(text) {
  if (!text) return '';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0] && data[0][0] && data[0][0][0]) {
      return cleanText(data[0][0][0]);
    }
  } catch (e) {
    console.error('Fallback translate failed:', e.message);
  }
  return text;
}

// 利用可能なGeminiモデルの動的取得
async function getBestAvailableModel() {
  if (process.env.GEMINI_MODEL) {
    return process.env.GEMINI_MODEL;
  }

  try {
    console.log('🔍 利用可能な最新のGeminiモデルを検索中...');
    const modelsResponse = await ai.models.list();
    const models = modelsResponse.models || [];

    const flashModel = models.find(m => 
      m.name && m.name.includes('flash') && !m.name.includes('experimental')
    );

    if (flashModel) {
      const modelId = flashModel.name.replace(/^models\//, '');
      console.log(`✅ 自動選択されたモデル: ${modelId}`);
      return modelId;
    }
  } catch (error) {
    console.warn('⚠️ モデル一覧取得失敗のためデフォルトを使用:', error.message);
  }

  return 'gemini-2.0-flash';
}

// 作品タイトルとサークル名を完全に英語化する関数
async function translateItemsToEnglish(items) {
  if (items.length === 0) return items;

  const sanitizedInput = items.map(i => ({
    title: cleanText(i.title),
    maker: cleanText(i.maker)
  }));

  if (ai) {
    const activeModel = await getBestAvailableModel();
    console.log(`🌐 Gemini API (${activeModel}) で ${items.length} 件のデータ翻訳を開始します...`);

    const prompt = `You are a professional translator specializing in Japanese anime, manga, ASMR, and doujin content.
Translate the following product titles and creator/circle names into clear, natural, high-converting English for an English-speaking audience.

STRICT INSTRUCTIONS:
1. Every single output title and maker name MUST be in English. Do NOT leave any Japanese Kanji, Hiragana, or Katakana.
2. Return ONLY a JSON array containing objects with keys "title" and "maker".
3. Maintain the exact same array length and order as input.
4. Use standard English terms (e.g., ASMR, Voice Drama, Ear Cleaning, Whispers, Doujinshi, RPG).

Input Data:
${JSON.stringify(sanitizedInput)}`;

    try {
      const response = await ai.models.generateContent({
        model: activeModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      console.log('--- Gemini API Raw Response ---');
      console.log(response.text);
      console.log('-------------------------------');

      const translatedArray = JSON.parse(response.text);

      if (Array.isArray(translatedArray) && translatedArray.length === items.length) {
        console.log('✅ Gemini APIによる英文翻訳が完了しました！');
        return items.map((item, index) => ({
          ...item,
          title: cleanText(translatedArray[index]?.title) || item.title,
          maker: cleanText(translatedArray[index]?.maker) || item.maker
        }));
      }
    } catch (error) {
      console.warn('⚠️ Gemini API制限のため、Google Translateへフォールバックします。');
    }
  }

  // フォールバック処理（Google Translate）
  console.log('🔄 無料Google翻訳エンジンで英文化を開始します...');
  const fallbackItems = [];
  for (const item of items) {
    const translatedTitle = await fallbackTranslate(item.title);
    const translatedMaker = await fallbackTranslate(item.maker);
    fallbackItems.push({
      ...item,
      title: translatedTitle || item.title,
      maker: translatedMaker || item.maker
    });
  }
  console.log('✅ フォールバック翻訳処理が完了しました！');
  return fallbackItems;
}

async function fetchDLsiteData() {
  console.log('Fetching DLsite Global Data (ENG Portal)...');
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US'
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  await context.addCookies([
    { name: 'adultchecked', value: '1', domain: '.dlsite.com', path: '/' },
    { name: 'work_view_option', value: '1', domain: '.dlsite.com', path: '/' },
    { name: 'locale', value: 'en_US', domain: '.dlsite.com', path: '/' },
    { name: '_lang', value: 'en-us', domain: '.dlsite.com', path: '/' }
  ]);

  try {
    console.log('Navigating to DLsite English Section...');
    await page.goto('https://www.dlsite.com/eng/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    const items = await page.evaluate((affiliateId) => {
      const list = [];
      const titleLinks = document.querySelectorAll('.work_name a, .work_title a, dt.work_name a, .multilingual_title a');

      titleLinks.forEach(linkEl => {
        const titleText = linkEl.innerText ? linkEl.innerText.trim() : '';
        if (!titleText) return;

        let rawLink = linkEl.getAttribute('href') || '';
        if (!rawLink) return;

        const rjMatch = rawLink.match(/(RJ[0-9]+)/i);
        if (!rjMatch) return;

        const rjCode = rjMatch[1].toUpperCase();

        const finalLink = `https://dlaf.jp/home/dlaf/=/t/s/link/work/aid/${affiliateId}/id/${rjCode}.html`;

        const container = linkEl.closest('tr') || linkEl.closest('.work_thumb_box') || linkEl.closest('li') || linkEl.closest('.work_1col') || linkEl.parentElement.parentElement;

        let maker = 'DLsite';
        let price = 'Price N/A';
        let workType = '';
        let imgUrl = '';

        if (container) {
          const makerEl = container.querySelector('.maker_name a, .author a, .maker a, .sub_title a');
          if (makerEl) maker = makerEl.innerText.trim();

          const priceEl = container.querySelector('.price, .work_price, .price_default, .strike_price');
          if (priceEl) price = priceEl.innerText.trim();

          const typeEl = container.querySelector('.work_category, .work_genre, .work_type, .work_img_icon span, .icon_work_type');
          if (typeEl) workType = typeEl.innerText.trim();

          const imgEl = container.querySelector('img');
          if (imgEl) {
            imgUrl = imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '';
            if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
          }
        }

        if (!imgUrl) {
          const digits = rjCode.replace('RJ', '');
          const num = parseInt(digits, 10);
          const rounded = Math.ceil(num / 1000) * 1000;
          const folder = 'RJ' + String(rounded).padStart(digits.length, '0');
          imgUrl = `https://img.dlsite.jp/modpub/images2/work/doujin/${folder}/${rjCode}_img_main.jpg`;
        }

        if (!list.some(i => i.link === finalLink)) {
          list.push({
            title: titleText,
            link: finalLink,
            rawLink: `https://www.dlsite.com/eng/work/=/product_id/${rjCode}.html`,
            maker: maker,
            image: imgUrl || 'https://www.dlsite.com/images/web/common/no_image/no_image_200x200.gif',
            price: price,
            workType: workType
          });
        }
      });

      return list;
    }, AFFILIATE_ID);

    console.log(`Successfully fetched: ${items.length} items`);
    return items;
  } catch (error) {
    console.error('Data fetch error:', error);
    return [];
  } finally {
    await browser.close();
  }
}

const commonStyle = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f5f7fa; color: #333; margin: 0; padding: 0; line-height: 1.5; }
  header { background-color: #ffffff; padding: 20px; text-align: center; border-bottom: 1px solid #e1e8ed; }
  header h1 { margin: 0; font-size: 1.4rem; color: #1c2938; }
  nav.categories { background-color: #2b3846; padding: 10px; text-align: center; flex-wrap: wrap; display: flex; justify-content: center; gap: 15px; }
  nav.categories a { color: #ffffff; text-decoration: none; font-weight: bold; font-size: 0.9rem; }
  nav.categories a:hover { color: #1da1f2; text-decoration: underline; }
  .breadcrumb { max-width: 1200px; margin: 15px auto 0; padding: 0 20px; font-size: 0.85rem; color: #657786; }
  .breadcrumb a { color: #1da1f2; text-decoration: none; }
  .container { max-width: 1200px; margin: 20px auto; padding: 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
  .card { background: #ffffff; border-radius: 8px; border: 1px solid #e1e8ed; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.15s ease; }
  .card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
  .card-img-wrapper { width: 100%; height: 180px; background-color: #e1e8ed; overflow: hidden; }
  .card img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .card-body { padding: 12px; display: flex; flex-direction: column; flex-grow: 1; }
  .card-title { font-size: 0.9rem; font-weight: bold; margin: 0 0 6px 0; line-height: 1.35; height: 2.7em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: #1c2938; }
  .card-maker { font-size: 0.8rem; color: #657786; margin-bottom: 8px; }
  .card-price { font-size: 0.95rem; color: #e63946; font-weight: bold; margin-top: auto; margin-bottom: 10px; }
  .btn { display: block; text-align: center; background-color: #1da1f2; color: #ffffff; text-decoration: none; padding: 8px 0; border-radius: 4px; font-weight: bold; font-size: 0.85rem; }
  .btn:hover { background-color: #0c85d0; }
  footer { text-align: center; padding: 20px; background: #ffffff; color: #657786; margin-top: 40px; border-top: 1px solid #e1e8ed; font-size: 0.85rem; }
  footer a { color: #1da1f2; text-decoration: none; margin: 0 10px; }
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
  <meta name="referrer" content="no-referrer">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <style>${commonStyle}</style>
</head>
<body>
  <header>
    <h1>${title}</h1>
  </header>
  <nav class="categories">
    <a href="/">All New</a>
    <a href="/asmr/">Voice / ASMR</a>
    <a href="/manga/">Manga & Comic</a>
    <a href="/game/">Games</a>
    <a href="/cg/">CG & Illustrations</a>
  </nav>

  <div class="breadcrumb">
    ${breadcrumbHTML}
  </div>

  <div class="container">
    <div class="grid">
      ${items.map(item => `
        <div class="card">
          <div class="card-img-wrapper">
            <img src="${item.image}" alt="${item.title}" loading="lazy" referrerpolicy="no-referrer">
          </div>
          <div class="card-body">
            <div class="card-title">${item.title}</div>
            <div class="card-maker">${item.maker}</div>
            <div class="card-price">${item.price}</div>
            <a href="${item.link}" class="btn" target="_blank" rel="noopener noreferrer">View on DLsite</a>
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  <footer>
    <p>
      <a href="/">Home</a> | 
      <a href="/asmr/">Voice / ASMR</a> | 
      <a href="/manga/">Manga</a> | 
      <a href="/game/">Games</a> | 
      <a href="/cg/">CG Collections</a>
    </p>
    <p>&copy; 2026 DLsite Recommended Works Hub</p>
  </footer>
</body>
</html>`;
}

async function main() {
  const rawItems = await fetchDLsiteData();

  if (rawItems.length === 0) {
    console.log('No data fetched. Aborting build process.');
    return;
  }

  // 取得データを英語へ翻訳（Gemini ➔ 失敗時は Google Translate）
  const items = await translateItemsToEnglish(rawItems);

  const publicDir = path.join(process.cwd(), 'public');
  const asmrDir = path.join(publicDir, 'asmr');
  const mangaDir = path.join(publicDir, 'manga');
  const gameDir = path.join(publicDir, 'game');
  const cgDir = path.join(publicDir, 'cg');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  if (!fs.existsSync(asmrDir)) fs.mkdirSync(asmrDir, { recursive: true });
  if (!fs.existsSync(mangaDir)) fs.mkdirSync(mangaDir, { recursive: true });
  if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });
  if (!fs.existsSync(cgDir)) fs.mkdirSync(cgDir, { recursive: true });

  const topHTML = generateHTML(
    'DLsite Global Works Hub | Daily Updates',
    'Explore the latest and popular works on DLsite including ASMR, Manga, Games, and CGs. Updated daily!',
    items,
    [{ name: 'Home', path: '/' }]
  );
  fs.writeFileSync(path.join(publicDir, 'index.html'), topHTML);

  const asmrKeywords = ['Voice', 'ASMR', 'Audio', 'Sound', '耳かき', '睡眠', '癒やし', 'Music', 'Drama', 'Whisper'];
  const asmrItems = items.filter(item => 
    asmrKeywords.some(kw => item.title.toLowerCase().includes(kw.toLowerCase()) || item.maker.toLowerCase().includes(kw.toLowerCase()) || item.workType.toLowerCase().includes(kw.toLowerCase()))
  );
  const asmrHTML = generateHTML(
    'DLsite Voice & ASMR Recommendations | Daily Hub',
    'Handpicked popular ASMR and audio works from DLsite. Find your best sleep sounds and voice dramas!',
    asmrItems.length > 0 ? asmrItems : items,
    [{ name: 'Home', path: '/' }, { name: 'Voice & ASMR', path: '/asmr/' }]
  );
  fs.writeFileSync(path.join(asmrDir, 'index.html'), asmrHTML);

  const mangaKeywords = ['Manga', 'Comic', 'Doujinshi'];
  const mangaItems = items.filter(item => 
    mangaKeywords.some(kw => item.title.toLowerCase().includes(kw.toLowerCase()) || item.maker.toLowerCase().includes(kw.toLowerCase()) || item.workType.toLowerCase().includes(kw.toLowerCase()))
  );
  const mangaHTML = generateHTML(
    'DLsite Doujin Manga & Comics | Daily Hub',
    'Popular doujin manga and comic releases from DLsite. Discover trending new indie comics daily!',
    mangaItems.length > 0 ? mangaItems : items,
    [{ name: 'Home', path: '/' }, { name: 'Manga & Comic', path: '/manga/' }]
  );
  fs.writeFileSync(path.join(mangaDir, 'index.html'), mangaHTML);

  const gameKeywords = ['Game', 'RPG', 'ACT', 'SLG', 'ADV', 'Novel', '3D', '2D'];
  const gameItems = items.filter(item => 
    gameKeywords.some(kw => item.title.toLowerCase().includes(kw.toLowerCase()) || item.maker.toLowerCase().includes(kw.toLowerCase()) || item.workType.toLowerCase().includes(kw.toLowerCase()))
  );
  const gameHTML = generateHTML(
    'DLsite Indie Games Recommendations | Daily Hub',
    'Top doujin games, RPGs, and action titles from DLsite. Discover great indie games updated daily!',
    gameItems.length > 0 ? gameItems : items,
    [{ name: 'Home', path: '/' }, { name: 'Games', path: '/game/' }]
  );
  fs.writeFileSync(path.join(gameDir, 'index.html'), gameHTML);

  const cgKeywords = ['CG', 'Illustration', 'Artbook'];
  const cgItems = items.filter(item => 
    cgKeywords.some(kw => item.title.toLowerCase().includes(kw.toLowerCase()) || item.maker.toLowerCase().includes(kw.toLowerCase()) || item.workType.toLowerCase().includes(kw.toLowerCase()))
  );
  const cgHTML = generateHTML(
    'DLsite CG & Illustration Collections | Daily Hub',
    'High quality CG sets and illustration archives from DLsite. Check out the latest artworks!',
    cgItems.length > 0 ? cgItems : items,
    [{ name: 'Home', path: '/' }, { name: 'CG & Illustrations', path: '/cg/' }]
  );
  fs.writeFileSync(path.join(cgDir, 'index.html'), cgHTML);

  const sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${DOMAIN}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${DOMAIN}/asmr/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${DOMAIN}/manga/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${DOMAIN}/game/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${DOMAIN}/cg/</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;
  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXML);

  const robotsTxt = `User-agent: *
Allow: /
Sitemap: ${DOMAIN}/sitemap.xml`;
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), robotsTxt);

  // 翻訳済みの確定データを出力
  fs.writeFileSync(path.join(publicDir, 'data.json'), JSON.stringify(items, null, 2));

  console.log('Build complete: DLsite Global (EN) static pages generated with AI translation.');
}

main();