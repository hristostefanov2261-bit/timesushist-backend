import express, { Request, Response } from 'express';
import cors from 'cors';
import crypto from 'crypto';
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

// Типы
interface TelegramInitData {
  user?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
  };
  auth_date: number;
  hash: string;
}

// Функция для проверки подписи Telegram
function verifyTelegramWebAppData(initData: string, botToken: string): { valid: boolean; data?: TelegramInitData } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      return { valid: false };
    }

    // Создаём строку для проверки
    const dataCheckString = Array.from(params.entries())
      .filter(([key]) => key !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Вычисляем хеш
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const isValid = computedHash === hash;

    if (isValid) {
      const data: TelegramInitData = {
        hash: hash,
        auth_date: parseInt(params.get('auth_date') || '0'),
      };

      const userStr = params.get('user');
      if (userStr) {
        data.user = JSON.parse(userStr);
      }

      return { valid: true, data };
    }

    return { valid: false };
  } catch (error) {
    console.error('Error verifying Telegram data:', error);
    return { valid: false };
  }
}

// Эндпоинт для аутентификации
app.post('/api/auth/telegram', async (req: Request, res: Response) => {
  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ error: 'Bot token not configured' });
    }

    // Проверяем подпись
    const { valid, data } = verifyTelegramWebAppData(initData, botToken);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid Telegram signature' });
    }

    if (!data?.user) {
      return res.status(400).json({ error: 'User data not found' });
    }

    const telegramUser = data.user;

    // Создаём или получаем пользователя в Supabase
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramUser.id)
      .single();

    let user = existingUser;

    if (fetchError && fetchError.code === 'PGRST116') {
      // Пользователя нет, создаём нового
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: telegramUser.id,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          username: telegramUser.username,
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
    } else if (fetchError) {
      console.error('Error fetching user:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch user' });
    }

    // Создаём JWT токен для фронтенда (базовый, без библиотеки)
    const token = Buffer.from(
      JSON.stringify({
        sub: user.id,
        telegram_id: telegramUser.id,
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
