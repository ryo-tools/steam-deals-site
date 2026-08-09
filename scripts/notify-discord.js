import fs from 'fs';
import path from 'path';

async function sendDiscordNotification() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('エラー: DISCORD_WEBHOOK_URL が設定されていません。');
    return;
  }

  // ファイル名を deals.json（または運用データ）に合わせる
  const dataPath = path.join(process.cwd(), 'public', 'deals.json');
  if (!fs.existsSync(dataPath)) {
    console.error('エラー: public/deals.json が見つかりません。');
    return;
  }

  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const items = JSON.parse(rawData);

    if (!items || items.length === 0) {
      console.log('通知対象のデータがありません。');
      return;
    }

    // 毎回同じ作品にならないようランダムピックアップ
    const randomIndex = Math.floor(Math.random() * items.length);
    const item = items[randomIndex];

    // ジャンルに応じた英語ハッシュタグの設定
    let hashtag = '#DLsite #JNSFW';
    const workTypeUpper = (item.workType || '').toUpperCase();
    
    if (workTypeUpper.includes('VOICE') || workTypeUpper.includes('ASMR') || workTypeUpper.includes('AUDIO')) {
      hashtag += ' #ASMR #VoiceDrama #AudioWork';
    } else if (workTypeUpper.includes('MANGA') || workTypeUpper.includes('COMIC') || workTypeUpper.includes('DOUJINSHI')) {
      hashtag += ' #Doujinshi #Manga';
    } else if (workTypeUpper.includes('GAME') || workTypeUpper.includes('RPG')) {
      hashtag += ' #IndieGame #DoujinGame';
    } else {
      hashtag += ' #ASMR #Doujin';
    }

    const title = "【X Post Stock (Global/EN)】";
    const body = `${item.title}\nCircle: ${item.maker} (${item.price || item.salePrice})\n\nCheck out this recommended work on DLsite! Perfect for relaxation.🎧\n\n${hashtag}\n👇 Details & Link in reply`;
    const replyUrl = item.link || item.url;
    const imageUrl = item.image || item.thumb;

    const payload = {
      content: `${title}\n\n**■ Main Tweet (Copy & Paste)**\n\`\`\`\n${body}\n\`\`\`\n-------------------\n**■ Reply URL**\n${replyUrl}`,
      embeds: [
        {
          title: item.title,
          color: 0x00fff0,
          image: {
            url: imageUrl
          }
        }
      ]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Discord通知失敗:', response.statusText);
    } else {
      console.log(`Discord通知完了: ${item.title}`);
    }
  } catch (error) {
    console.error('Discord通知エラー:', error);
  }
}

sendDiscordNotification();