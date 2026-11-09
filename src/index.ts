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
  origin: ['https://timesushist.vercel.app', 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, {
    origin: req.get('origin'),
    host: req.get('host'),
  });
  next();
});

// Debug env (временный, удалить после проверки)
app.get('/api/debug-env', (req: Request, res: Response) => {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  res.json({
    supabase_url_present: !!url,
    supabase_url_prefix: url.slice(0, 30),
    key_present: !!key,
    key_prefix: key.slice(0, 10),
    node_env: process.env.NODE_ENV,
  });
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: process.env.SUPABASE_URL ? 'configured' : 'not configured',
  });
});

// Генерация 6-значного кода и создание пользователя
app.post('/api/auth/generate', async (req: Request, res: Response) => {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Проверяем, что код не занят
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('code', code)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Код занят, попробуйте снова' });
    }

    // Создаём пользователя
    const { data: user, error: createError } = await supabase
      .from('users')
      .insert({
        code,
        first_name: 'Пользователь',
        last_name: null,
        username: null,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating user:', createError);
      return res.status(500).json({ error: `Failed to create user: ${createError.message}` });
    }

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

    // Базовый JWT-like токен
    const token = Buffer.from(
      JSON.stringify({
        sub: user.id,
        code,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      })
    ).toString('base64');

    res.json({
      success: true,
      code,
      user: {
        id: user.id,
        code: user.code,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
      },
      token,
    });
  } catch (error) {
    console.error('Generate code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Проверка кода → возврат пользователя и токена
app.post('/api/auth/verify', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code || code.length !== 6) {
      return res.status(400).json({ error: 'Код должен содержать 6 цифр' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Неверный код' });
    }

    const token = Buffer.from(
      JSON.stringify({
        sub: user.id,
        code: user.code,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      })
    ).toString('base64');

    res.json({
      success: true,
      user: {
        id: user.id,
        code: user.code,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
      },
      token,
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение пользователя по коду (для веб-сайта)
app.get('/api/user/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({
      id: user.id,
      code: user.code,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Эндпоинт для получения пользователя (если уже аутентифицирован по токену)
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

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
});
