// Passes for sale. Prices in US cents. Underscore name: not a public route.
// ai = AI design actions (AI Build, photo to 3D, prompt writing), each one a Claude request.
// Limits are set so every pass keeps at least 60% profit even when fully used:
// worst case at $0.25 per AI action, $0.10 per image, $2.50 per video, plus Stripe's 2.9% + 30c.
export const PLANS = {
  week:  { name: "1 Week Pass",  amount: 9900,  days: 7,   images: 3,  videos: 1, ai: 50 },
  month: { name: "1 Month Pass", amount: 19900, days: 30,  images: 6,  videos: 2, ai: 150 },
  year:  { name: "1 Year Pass",  amount: 39900, days: 365, images: 30, videos: 8, ai: 450 },
};
