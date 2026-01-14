import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

const payload = {
  contents: [{
    parts: [{ text: "Hi" }]
  }]
};

console.log("--- ĐANG TEST API TRỰC TIẾP ---");
console.log("URL:", url.split('key=')[0] + "key=***");

async function test() {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (response.ok) {
      console.log("✅ API HOẠT ĐỘNG!");
      console.log("Phản hồi:", data.candidates[0].content.parts[0].text);
    } else {
      console.log("❌ API LỖI!");
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error("❌ LỖI KẾT NỐI:", err.message);
  }
}

test();
