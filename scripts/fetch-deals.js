// 確実に通るシンプルなAPI URL
const API_URL = 'https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=50';

async function fetchCheapSharkDeals() {
  console.log('CheapShark APIからSteamセールデータを取得中...');
  
  try {
    // ヘッダーに User-Agent を設定してブロックを回避
    const response = await fetch(API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const deals = await response.json();

    // 海外ユーザー向けに整形
    const items = deals.slice(0, 50).map(deal => {
      const savingsNum = Math.round(deal.savings);
      const salePriceNum = parseFloat(deal.salePrice);
      
      return {
        id: deal.dealID,
        title: deal.title,
        salePrice: `$${deal.salePrice}`,
        normalPrice: `$${deal.normalPrice}`,
        salePriceNum: salePriceNum,
        savingsNum: savingsNum,
        savings: `${savingsNum}% OFF`,
        thumb: deal.thumb,
        steamAppID: deal.steamAppID,
        link: `https://www.cheapshark.com/redirect?dealID=${deal.dealID}`
      };
    });

    console.log(`データ取得成功: ${items.length} 件`);
    return items;
  } catch (error) {
    console.error('CheapShark API取得エラー:', error);
    return [];
  }
}