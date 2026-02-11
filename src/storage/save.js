const { createClient } = require('@supabase/supabase-js');

// Render stellt diese Variablen automatisch über process.env bereit
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_KEY
);

async function readSave(userId) {
  try {
    const { data, error } = await supabase
      .from('saves')
      .select('state')
      .eq('user_id', userId.toString())
      .single();

    if (error || !data) return null;
    return data.state;
  } catch (err) {
    // Falls kein Spielstand existiert, geben wir null zurück
    return null;
  }
}

async function writeSave(userId, state) {
  try {
    // Upsert: Aktualisiert den Stand oder erstellt ihn neu, falls die ID nicht existiert
    const { error } = await supabase
      .from('saves')
      .upsert({ 
        user_id: userId.toString(), 
        state: state,
        updated_at: new Date() 
      }, { onConflict: 'user_id' });

    if (error) throw error;
    console.log(`Cloud-Save erfolgreich für User ${userId}`);
  } catch (err) {
    console.error("DB-Schreibfehler:", err.message);
  }
}

module.exports = { readSave, writeSave };
