import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const email = 'kangarotechau@gmail.com';
  const plainPassword = 'Kangaro@au2026#';

  console.log(`Seeding system_operator account: ${email}`);

  // Hash the password securely
  const password_hash = await bcrypt.hash(plainPassword, 12);

  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    console.log('User already exists. Updating password and role to system_operator.');
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash,
        role: 'system_operator',
        is_active: true,
        is_verified: true,
      })
      .eq('id', existingUser.id);

    if (updateError) {
      console.error('Error updating user:', updateError);
    } else {
      console.log('User updated successfully!');
    }
  } else {
    console.log('Creating new system_operator user.');
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash,
        role: 'system_operator',
        preferred_language: 'en',
        is_active: true,
        is_verified: true,
        auth_method: 'email',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error creating user:', insertError);
    } else {
      console.log(`User created successfully with ID: ${newUser.id}`);
    }
  }
}

main().catch(console.error);
