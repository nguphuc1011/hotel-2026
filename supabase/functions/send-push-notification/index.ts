import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as djwt from "https://deno.land/x/djwt@v2.8/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

async function getAccessToken(serviceAccount: any) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  // Chuyển đổi private key từ dạng PEM sang CryptoKey
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const jwt = await djwt.create({ alg: "RS256", typ: "JWT" }, payload, key)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await response.json()
  return data.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    const { user_id, title, body, data } = await req.json()

    // 1. Lấy Token
    let query = supabaseClient.from('user_push_tokens').select('token')
    if (user_id) query = query.eq('user_id', user_id)
    const { data: tokens, error: tokenError } = await query

    if (tokenError || !tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Không tìm thấy Token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. Lấy Access Token Firebase
    const firebaseKey = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY')
    if (!firebaseKey) throw new Error('Thiếu FIREBASE_SERVICE_ACCOUNT_KEY')
    
    const serviceAccount = JSON.parse(firebaseKey)
    const accessToken = await getAccessToken(serviceAccount)

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`

    // 3. Gửi thông báo
    const sendPromises = tokens.map(async (t: any) => {
      const message = {
        message: {
          token: t.token,
          notification: { title: title || 'MẮT THẦN', body: body || 'Thông báo mới' },
          data: data || {},
          webpush: {
            headers: { Urgency: 'high' },
            notification: {
              icon: 'https://cdn-icons-png.flaticon.com/512/2983/2983803.png',
              requireInteraction: true,
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

    return new Response(JSON.stringify({ success: true, sent_count: successCount, total_tokens: tokens.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
