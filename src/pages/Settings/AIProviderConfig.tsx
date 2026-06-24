import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  InputAdornment,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import KeyIcon from '@mui/icons-material/Key';
import SaveIcon from '@mui/icons-material/Save';
import ScienceIcon from '@mui/icons-material/Science';
import { aiConfigApi } from '../../api/aiConfigApi';
import type { AiProviderConfig } from '../../types/aiConfig';

const defaultForm = {
  provider: 'deepseek' as const,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: '',
  enabled: true,
};

const AIProviderConfig: React.FC = () => {
  const [form, setForm] = useState(defaultForm);
  const [config, setConfig] = useState<AiProviderConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const loadConfig = async () => {
    setLoading(true);
    setMessage(null);
    const res = await aiConfigApi.getConfig().catch((error) => ({
      code: -1,
      data: null,
      message: error instanceof Error ? error.message : '读取失败',
    }));
    if (res.code === 0 && res.data) {
      setConfig(res.data);
      setForm({
        provider: 'deepseek',
        baseUrl: res.data.baseUrl,
        model: res.data.model,
        apiKey: '',
        enabled: res.data.enabled,
      });
    } else {
      setMessage({ type: 'error', text: res.message || '读取AI配置失败' });
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const res = await aiConfigApi.saveConfig(form).catch((error) => ({
      code: -1,
      data: null,
      message: error instanceof Error ? error.message : '保存失败',
    }));
    if (res.code === 0 && res.data) {
      setConfig(res.data);
      setForm((current) => ({ ...current, apiKey: '' }));
      setMessage({ type: 'success', text: 'DeepSeek API Key配置已保存' });
    } else {
      setMessage({ type: 'error', text: res.message || '保存AI配置失败' });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    const res = await aiConfigApi.testConnection().catch((error) => ({
      code: -1,
      data: null,
      message: error instanceof Error ? error.message : '测试失败',
    }));
    if (res.code === 0) {
      setMessage({ type: 'success', text: res.data?.response || 'DeepSeek连接正常' });
    } else {
      setMessage({ type: 'error', text: res.message || 'DeepSeek连接失败' });
    }
    setTesting(false);
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <AutoAwesomeIcon color="primary" fontSize="small" />
            AI大脑配置
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            系统AI助手和AI名片将使用这里保存的DeepSeek配置。
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
          <Tooltip title="使用当前已保存配置向DeepSeek发送一次测试请求">
            <span>
              <Button variant="outlined" startIcon={<ScienceIcon />} onClick={handleTest} disabled={loading || saving || testing || !config?.hasApiKey}>
                测试连接
              </Button>
            </span>
          </Tooltip>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={loading || saving || testing}>
            保存配置
          </Button>
        </Stack>
      </Stack>

      {message && <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>}

      <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1.5, p: 2.5 }}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip color="primary" label="DeepSeek" size="small" />
            <Chip
              color={config?.hasApiKey ? 'success' : 'warning'}
              label={config?.hasApiKey ? `已配置 ${config.apiKeyPreview}` : '未配置API Key'}
              size="small"
              variant={config?.hasApiKey ? 'filled' : 'outlined'}
            />
            <Chip label={form.enabled ? '已启用' : '已停用'} size="small" variant="outlined" />
          </Stack>

          <TextField
            label="API Key"
            type="password"
            value={form.apiKey}
            onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
            placeholder={config?.hasApiKey ? '留空则继续使用已保存的Key' : '请输入DeepSeek API Key'}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <KeyIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="API Base URL"
              value={form.baseUrl}
              onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
              fullWidth
            />
            <TextField
              label="模型"
              value={form.model}
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
              fullWidth
            />
          </Stack>

          <FormControlLabel
            control={(
              <Switch
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              />
            )}
            label="启用DeepSeek作为系统AI大脑"
          />
        </Stack>
      </Paper>
    </Box>
  );
};

export default AIProviderConfig;
