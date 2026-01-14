import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    console.log("--- ĐANG LIỆT KÊ CÁC MODEL KHẢ DỤNG ---");
    // Sử dụng fetch trực tiếp để gọi API listModels vì SDK có thể bị giới hạn version
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok) {
      console.log("Danh sách model:");
      data.models.forEach(m => {
        console.log(`- ${m.name} (Hỗ trợ: ${m.supportedGenerationMethods.join(', ')})`);
      });
    } else {
      console.error("❌ Lỗi khi liệt kê:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ Lỗi kết nối:", error.message);
  }
}

listModels();
