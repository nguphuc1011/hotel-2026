import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

async function getAccessToken(serviceAccount: any) {
  try {
    const pem = serviceAccount.private_key
      .replace(/\\n/g, '\n')
      .replace(/\"/g, '');

    const key = await jose.importPKCS8(pem, 'RS256')
    
    const jwt = await new jose.SignJWT({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key)

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(`Google Auth Fail: ${JSON.stringify(data)}`)
    return data.access_token
  } catch (err: any) {
    throw new Error(`[MẮT THẦN] Lỗi xác thực Firebase: ${err.message}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    const firebaseKeyRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY')
    if (!firebaseKeyRaw) throw new Error('Chưa cấu hình FIREBASE_SERVICE_ACCOUNT_KEY!')

    const serviceAccount = JSON.parse(firebaseKeyRaw)
    const accessToken = await getAccessToken(serviceAccount)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    
    const body = await req.json().catch(() => ({}))
    const user_id = body.user_id

    const { data: tokens, error: dbError } = await supabase
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', user_id)

    if (dbError) throw dbError;

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Không tìm thấy Token nào hợp lệ.' 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`
    
    const invalidTokens: string[] = []
    const results = await Promise.all(tokens.map(async (t) => {
      try {
        const fcmRes = await fetch(fcmUrl, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${accessToken}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({
              message: {
                token: t.token,
                notification: { 
                  title: body.title || 'MẮT THẦN HÀNH QUÂN', 
                  body: body.body || `Báo cáo Bệ Hạ, hỏa tiễn đã nổ lúc ${new Date().toLocaleTimeString('vi-VN')}!` 
                },
                webpush: {
                  fcm_options: {
                    link: 'https://hotel-2026.vercel.app/thao-insight'
                  },
                  notification: {
                    icon: 'https://oyrupgbavjpyyobbnrth.supabase.co/storage/v1/object/public/icons/favicon.ico',
                    tag: `eye-of-god-${Date.now()}`, // Tạo tag duy nhất để không bị gộp thông báo
                    renotify: true // Ép báo rung/chuông kể cả khi cùng tag
                  }
                }
              }
          })
        })

        const fcmData = await fcmRes.json()
        if (!fcmRes.ok) {
          console.error(`[MẮT THẦN] Lỗi FCM cho token ${t.token.substring(0, 10)}:`, fcmData)
          if (fcmData.error?.status === 'NOT_FOUND' || fcmData.error?.details?.[0]?.errorCode === 'UNREGISTERED' || fcmData.error?.message?.includes("NotRegistered")) {
            invalidTokens.push(t.token)
          }
          return { success: false, token: t.token, error: fcmData }
        }
        return { success: true, token: t.token }
      } catch (e) {
        console.error(`[MẮT THẦN] Lỗi kết nối FCM:`, e)
        return { success: false, token: t.token, error: e }
      }
    }))

    // Tự động dọn dẹp các Token rác
    if (invalidTokens.length > 0) {
      console.log(`[MẮT THẦN] Đang dọn dẹp ${invalidTokens.length} Token đã hết hạn...`);
      await supabase.from('user_push_tokens').delete().in('token', invalidTokens)
    }

    const sentCount = results.filter(r => r.success).length
    return new Response(JSON.stringify({ 
      success: sentCount > 0, 
      sent_count: sentCount, 
      total_tokens: tokens.length,
      cleaned_tokens: invalidTokens.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
