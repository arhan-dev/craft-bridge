export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  // Read the API key securely from Vercel Environment Variables
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured on this Vercel project."
    });
  }

  try {
    const { image, mimeType } = req.body || {};

    if (!image || !mimeType) {
      return res.status(400).json({
        error: 'Request must include base64 "image" and "mimeType".'
      });
    }

    // Only allow image files
    if (!mimeType.startsWith("image/")) {
      return res.status(400).json({
        error: "mimeType must be an image type."
      });
    }

    // Prevent excessively large uploads
    if (image.length > 12_000_000) {
      return res.status(413).json({
        error: "Image is too large. Please use a file under 8MB."
      });
    }

    const prompt = `You are a cataloging assistant for an Indian artisan marketplace. Look at this product photo and respond with ONLY a raw JSON object (no markdown fences, no preamble) with exactly these keys:

{
  "title": "a short, appealing product title (max 8 words)",
  "category": "the single best-fit category, chosen ONLY from this exact list: Pottery, Home Decor, Textiles & Weaves, Metal Craft, Woodwork, Jewelry, Paintings",
  "description": "a warm 2-3 sentence craft-focused product description, written as if for a marketplace listing",
  "tags": ["3 to 5 short category/material tags, e.g. Pottery, Handmade, Terracotta"]
}`;

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: image
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 400
        }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();

      return res.status(502).json({
        error: `Gemini API error (${geminiRes.status}): ${errText.slice(0, 300)}`
      });
    }

    const geminiData = await geminiRes.json();

    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Remove markdown code fences if Gemini adds them
    const cleaned = rawText
      .replace(/```json|```/g, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      parsed = {
        title: "Handcrafted Product",
        category: "Home Decor",
        description:
          cleaned ||
          "Unable to generate a description for this image.",
        tags: ["Handmade"]
      };
    }

    return res.status(200).json(parsed);

  } catch (error) {
    return res.status(502).json({
      error: "Failed to reach Gemini API: " + error.message
    });
  }
}
