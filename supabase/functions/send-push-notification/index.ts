import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { JWT } from "https://esm.sh/google-auth-library@8.7.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // 1. Xử lý CORS cho preflight requests (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200, 
      headers: corsHeaders 
    })
  }

  try {
    console.log('--- NHẬN YÊU CẦU BẮN HỎA TIỄN ---')
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Kiểm tra body
    let bodyData;
    try {
      bodyData = await req.json()
      console.log('Payload nhận được:', JSON.stringify(bodyData))
    } catch (e) {
      console.error('Lỗi parse JSON body:', e)
      return new Response(JSON.stringify({ success: false, message: 'Invalid JSON body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const { user_id, title, body, data } = bodyData

    // 1. Lấy Token từ bảng user_push_tokens
    let query = supabaseClient
      .from('user_push_tokens')
      .select('token')

    if (user_id) {
      query = query.eq('user_id', user_id)
    }
    
    const { data: tokens, error: tokenError } = await query

    if (tokenError || !tokens || tokens.length === 0) {
      console.log('Không tìm thấy Token nào để gửi thông báo')
      return new Response(JSON.stringify({ success: false, message: 'Không có Token nào trong hệ thống' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. Chuẩn bị xác thực với Firebase qua Service Account Key
    // Bệ Hạ cần dán FIREBASE_SERVICE_ACCOUNT_KEY (dạng JSON) vào biến môi trường của Supabase
    const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY') || '{}')
    
    const jwtClient = new JWT(
      serviceAccount.client_email,
      undefined,
      serviceAccount.private_key,
      ['https://www.googleapis.com/auth/cloud-platform']
    )

    const tokenResponse = await jwtClient.getAccessToken()
    const accessToken = tokenResponse.token

    const project_id = serviceAccount.project_id
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${project_id}/messages:send`

    // 3. Gửi thông báo tới từng Token (với High Priority)
    const sendPromises = tokens.map(async (t: any) => {
      const message = {
        message: {
          token: t.token,
          notification: {
            title: title || 'MẮT THẦN CẢNH BÁO',
            body: body || 'Có biến động tại vương quốc, mời Bệ Hạ xem xét!',
          },
          data: data || {},
          android: {
            priority: 'high',
            notification: {
              channel_id: 'high_importance_channel',
              sound: 'default',
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
          },
          apns: {
            payload: {
              aps: {
                contentAvailable: true,
                sound: 'default',
              },
            },
            headers: {
              'apns-priority': '10', // High priority cho iOS
            },
          },
          webpush: {
            headers: {
              Urgency: 'high',
            },
            notification: {
              icon: 'https://cdn-icons-png.flaticon.com/512/2983/2983803.png',
              requireInteraction: true, // Yêu cầu Bệ Hạ tương tác mới mất
            },
          },
        },
      }

      return fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      })
    })

    const results = await Promise.all(sendPromises)
    const successCount = results.filter(r => r.ok).length

    return new Response(JSON.stringify({ 
      success: true, 
      sent_count: successCount, 
      total_tokens: tokens.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
