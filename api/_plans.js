// Passes and extra credits for sale. Prices in US cents. Underscore name: not a public route.
// ai = AI Build actions (AI Build from words, photo to 3D, prompt writing), each one a Claude request.
// Limits keep every pass at 60% profit or more even when fully used. Worst case per use: $0.25 per AI action,
// $0.30 per image (Nano Banana Pro at 2K), $2.50 per video (allowing for a premium video model; Kling standard is ~$0.56 for the 10-second clips we make),
// plus Stripe's 2.9% + 30c. Week ~78%, month ~71%, year ~60%.
export const PLANS = {
  week:  { name: "1 Week Pass",  amount: 9900,  days: 7,   images: 4,  videos: 2,  ai: 50 },
  month: { name: "1 Month Pass", amount: 19900, days: 30,  images: 8,  videos: 4,  ai: 150 },
  year:  { name: "1 Year Pass",  amount: 39900, days: 365, images: 30, videos: 10, ai: 450 },
};

// Extra AI Render credits, bought one kind at a time and added to the customer's active pass.
// They last as long as that pass. Margins: image ~85%, video ~88% (about 72% even with a premium video model),
// AI Build pack of 10 ~41% if every action hits the $0.25 worst case (typical Claude requests cost far less).
export const ADDONS = {
  image: { name: "Extra AI image", plural: "Extra AI images", amount: 500 },
  ai: { name: "10 extra AI Build actions", plural: "packs of 10 extra AI Build actions", amount: 500, per: 10 },
  video: { name: "Extra 10-second AI video", plural: "Extra 10-second AI videos", amount: 1000 },
};
export const ADDON_MAX_QTY = 20;
