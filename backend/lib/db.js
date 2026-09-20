const { createClient } = require('@supabase/supabase-js')

// Use service role key — gives full DB access server-side
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Tables are created manually in Supabase dashboard (see below)
// This just checks the connection is working
async function initDB() {
  const { error } = await supabase.from('products').select('id').limit(1)
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Supabase connection failed: ${error.message}`)
  }
  console.log('✅ Supabase connected')
}

module.exports = { supabase, initDB }