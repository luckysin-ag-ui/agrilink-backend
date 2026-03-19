const dotenv = require('dotenv');
dotenv.config(); // ← MUST be first!

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
const PORT = process.env.PORT || 5000;

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(cors());
app.use(express.json());

// ── TEST ROUTE ──
app.get('/', (req, res) => {
  res.json({ message: '🌾 AgriLink Backend is running!' });
});
// ── REGISTER ──
app.post('/api/register', async (req, res) => {
  const { full_name, mobile, email, password, role, state } = req.body;
  if (!full_name || !mobile || !password || !role) {
    return res.status(400).json({ error: 'Please fill all required fields.' });
  }
  try {
    // Check if mobile already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('mobile', mobile)
      .single();
    if (existing) {
      return res.status(400).json({ error: 'Mobile number already registered.' });
    }
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Insert user
    const { data, error } = await supabase
      .from('users')
      .insert([{ full_name, mobile, email, password: hashedPassword, role, state }])
      .select()
      .single();
    if (error) throw error;
    // Generate token
    const token = jwt.sign(
      { id: data.id, role: data.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ message: 'Registration successful!', token, user: { id: data.id, full_name: data.full_name, role: data.role, state: data.state } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LOGIN ──
app.post('/api/login', async (req, res) => {
  const { mobile, password } = req.body;
  if (!mobile || !password) {
    return res.status(400).json({ error: 'Please enter mobile and password.' });
  }
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('mobile', mobile)
      .single();
    if (error || !user) {
      return res.status(400).json({ error: 'Mobile number not found.' });
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Incorrect password.' });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ message: 'Login successful!', token, user: { id: user.id, full_name: user.full_name, role: user.role, state: user.state } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET ALL CONTRACTS ──
app.get('/api/contracts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST A CONTRACT (Industry only) ──
app.post('/api/contracts', async (req, res) => {
  const { industry_id, crop_type, crop_grade, quantity_mt, price_per_kg, region, deadline, delivery_location, quality_requirements, description } = req.body;
  if (!industry_id || !crop_type || !quantity_mt || !price_per_kg || !region || !deadline) {
    return res.status(400).json({ error: 'Please fill all required fields.' });
  }
  try {
    const { data, error } = await supabase
      .from('contracts')
      .insert([{ industry_id, crop_type, crop_grade, quantity_mt, price_per_kg, region, deadline, delivery_location, quality_requirements, description }])
      .select()
      .single();
    if (error) throw error;
    res.json({ message: 'Contract posted successfully!', contract: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── APPLY TO CONTRACT (Farmer only) ──
app.post('/api/applications', async (req, res) => {
  const { contract_id, farmer_id, quantity_offered, message } = req.body;
  if (!contract_id || !farmer_id) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  try {
    const { data, error } = await supabase
      .from('applications')
      .insert([{ contract_id, farmer_id, quantity_offered, message }])
      .select()
      .single();
    if (error) throw error;
    res.json({ message: 'Application submitted successfully!', application: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET APPLICATIONS FOR A CONTRACT ──
app.get('/api/applications/:contract_id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applications')
      .select('*, users(full_name, mobile, state)')
      .eq('contract_id', req.params.contract_id);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE APPLICATION STATUS ──
app.patch('/api/applications/:id', async (req, res) => {
  const { status } = req.body;
  try {
    const { data, error } = await supabase
      .from('applications')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ message: 'Application updated!', application: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SEND MESSAGE ──
app.post('/api/messages', async (req, res) => {
  const { sender_id, receiver_id, contract_id, content } = req.body;
  if (!sender_id || !receiver_id || !content) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([{ sender_id, receiver_id, contract_id, content }])
      .select()
      .single();
    if (error) throw error;
    res.json({ message: 'Message sent!', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET MESSAGES ──
app.get('/api/messages/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// START SERVER
app.post('/api/chat', async (req, res) => {
  const { message, system } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required.' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: system || 'You are AgriLink AI assistant.',
        messages: [{ role: 'user', content: message }]
      })
    });
    const data = await response.json();
    const reply = data.content?.[0]?.text || 'Sorry, could not get a response.';
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── AI CHAT ROUTE ──
app.post('/api/chat', async (req, res) => {
  const { message, system } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: system || 'You are AgriLink AI assistant.' },
        { role: 'user', content: message }
      ],
      max_tokens: 1000
    });
    const reply = completion.choices[0]?.message?.content || 'Sorry, could not get a response.';
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.listen(PORT, () => {
  console.log(`🌾 AgriLink backend running on port ${PORT}`);
});