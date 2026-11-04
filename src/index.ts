import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase клиент (используем service role key для бэкенда)
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());

// Эндпоинт для простой аутентификации по Telegram ID
// Версия без проверки подписи - просто создаём/получаем пользователя по ID
app.post('/api/auth/telegram', async (req: Request, res: Response) => {
  try {
    const { user_id, first_name, last_name, username } = req.body;

    // Проверяем что передан user_id
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    console.log(`🔐 Auth request for Telegram user: ${user_id} (${first_name})`);

    // Создаём или получаем пользователя в Supabase
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', user_id)
      .single();

    let user = existingUser;

    if (fetchError && fetchError.code === 'PGRST116') {
      // Пользователя нет, создаём нового
      console.log(`👤 Creating new user: ${user_id}`);

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: user_id,
          first_name: first_name || 'User',
          last_name: last_name || null,
          username: username || null,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating user:', createError);
        return res.status(500).json({ error: 'Failed to create user' });
      }

      user = newUser;

      // Создаём дефолтные настройки пользователя
      await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          hourly_rate: 15,
          currency: 'PLN',
          date_format: 'DD.MM.YYYY',
          theme: 'light',
        });

      console.log(`✅ User created: ${user.id}`);
    } else if (fetchError) {
      console.error('Error fetching user:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch user' });
    } else {
      console.log(`✅ User found: ${user.id}`);
    }

    // Создаём JWT токен для фронтенда (базовый, без библиотеки)
    const token = Buffer.from(
      JSON.stringify({
        sub: user.id,
        telegram_id: user_id,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 дней
      })
    ).toString('base64');

    res.json({
      success: true,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
      },
      token,
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Эндпоинт для получения пользователя (если уже аутентифицирован)
app.get('/api/user', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      const userId = decoded.sub;

      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
});
