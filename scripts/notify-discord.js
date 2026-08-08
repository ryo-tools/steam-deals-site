import fs from 'fs';
import path from 'path';

async function sendDiscordNotification() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('DISCORD_WEBHOOK_URL is not set.');
    process.exit(1);
  }

  const dataPath = path.join(process.cwd(), 'public', 'data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('public/data.json not found.');
    process.exit(0);
  }

  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const items = JSON.parse(rawData);

    if (!items || items.length === 0) {
      console.log('No data available for notification.');
      process.exit(0);
    }

    // 先頭の1件（最新作品）をピックアップ
    const item = items[0];

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
    const body = `${item.title}\nCircle: ${item.maker} (${item.price})\n\nCheck out this recommended work on DLsite! Perfect for relaxation.🎧\n\n${hashtag}\n👇 Details & Link in reply`;
    const replyUrl = item.link;
    const imageUrl = item.image;

    const payload = {
      content: `${title}\n\n**■ Main Tweet (Copy & Paste)**\n${body}\n\n-------------------\n**■ Reply URL**\n${replyUrl}`,
      embeds: [
        {
          title: item.title,
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
      console.error('Discord notification failed:', response.statusText);
    } else {
      console.log('Discord notification sent successfully with image (Global)!');
    }
  } catch (error) {
    console.error('Discord notification error:', error);
  }
}

sendDiscordNotification();