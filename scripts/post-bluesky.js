import fs from 'fs';
import path from 'path';
import { BskyAgent, RichText } from '@atproto/api';

const HANDLE = process.env.BLUESKY_HANDLE;
const PASSWORD = process.env.BLUESKY_PASSWORD;

// 自身のCloudflare Pagesドメイン（または特化ページURL）に変更してください
const SITE_URL = 'https://steam-deals-site.pages.dev';

async function postToBluesky() {
  if (!HANDLE || !PASSWORD) {
    console.log('Blueskyのログイン情報が未設定のため投稿をスキップします。');
    return;
  }

  // fetch-deals.jsで出力された deals.json を読み込み
  const jsonPath = path.join(process.cwd(), 'public', 'deals.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('deals.json が見つからないため投稿をスキップします。');
    return;
  }

  const items = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (!items || items.length === 0) {
    console.log('投稿対象のゲームデータがありません。');
    return;
  }

  // 1. セール品の中からランダムで1件選定
  const randomIndex = Math.floor(Math.random() * items.length);
  const topItem = items[randomIndex];

  const agent = new BskyAgent({ service: 'https://bsky.social' });

  try {
    await agent.login({ identifier: HANDLE, password: PASSWORD });
    console.log('Blueskyログイン成功');

    let thumbBlob = undefined;

    // サムネイル画像のアップロード
    if (topItem.thumb && topItem.thumb.startsWith('http')) {
      try {
        console.log(`画像をダウンロード中: ${topItem.thumb}`);
        const response = await fetch(topItem.thumb, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          }
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          const uploadRes = await agent.uploadBlob(buffer, {
            encoding: 'image/jpeg'
          });

          thumbBlob = uploadRes.data.blob;
          console.log('サムネイル画像のアップロード成功！');
        }
      } catch (imgError) {
        console.error('画像アップロードに失敗（テキストのみで続行します）:', imgError);
      }
    }

    // 2. 英語圏向けキャッチコピーのランダム選定
    const hooks = [
      '🎮【Steam Deal Alert】Historical Low Price!',
      '🔥【PC Game Sale】Huge Discount Picked!',
      '⚡【Cheap PC Games】Best Steam Deals Today',
      '✨【Steam Pick】Don\'t Miss This Discount!'
    ];
    const selectedHook = hooks[Math.floor(Math.random() * hooks.length)];

    // タイトルの長さを調整（文字数オーバー防止）
    const displayTitle = topItem.title.length > 40 ? topItem.title.substring(0, 37) + '...' : topItem.title;

    // 本文テキスト構築（英語圏向け自サイト誘導）
    const rawText = `${selectedHook}\n\n『${displayTitle}』\nPrice: ${topItem.salePrice} (${topItem.savings})\nNormal: ${topItem.normalPrice}\n\n👇Check Deals & Store Info:\n${SITE_URL}`;
    
    const rt = new RichText({ text: rawText });
    await rt.detectFacets(agent);

    // 3. 外部リンクカード設定
    const postPayload = {
      text: rt.text,
      facets: rt.facets,
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          uri: SITE_URL,
          title: `【${topItem.savings}】${displayTitle}`,
          description: `Get ${topItem.title} on sale for ${topItem.salePrice} (Reg. ${topItem.normalPrice}) - Steam Deals & Price Tracker`,
          thumb: thumbBlob
        }
      },
      createdAt: new Date().toISOString()
    };

    await agent.post(postPayload);

    console.log(`Blueskyへのゲームセール投稿完了: ${topItem.title}`);
  } catch (error) {
    console.error('Bluesky投稿エラー:', error);
  }
}

postToBluesky();