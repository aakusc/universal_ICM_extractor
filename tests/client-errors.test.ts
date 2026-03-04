import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CaptivateIQClient } from '../src/connectors/captivateiq/client.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('CaptivateIQClient Error Handling', () => {
  let client: CaptivateIQClient;
  
  beforeEach(() => {
    vi.clearAllMocks();
    client = new CaptivateIQClient({ 
      baseUrl: 'https://api.test.captivateiq.com/ciq/v1', 
      apiToken: 'test-token' 
    });
  });

  it('should handle network errors gracefully', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));
    
    await expect(client.listPlans()).rejects.toThrow('Network error');
  });

  it('should handle 401 unauthorized responses', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Unauthorized')
    });
    
    await expect(client.listPlans()).rejects.toThrow('CaptivateIQ API error: 401');
  });

  it('should handle 403 forbidden responses', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: () => Promise.resolve('Forbidden')
    });
    
    await expect(client.listPlans()).rejects.toThrow('CaptivateIQ API error: 403');
  });

  it('should handle 404 not found responses', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('Not Found')
    });
    
    await expect(client.listPlans()).rejects.toThrow('CaptivateIQ API error: 404');
  });

  it('should handle 500 server errors', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Internal Server Error')
    });
    
    await expect(client.listPlans()).rejects.toThrow('CaptivateIQ API error: 500');
  });

  it('should handle timeout errors', async () => {
    const timeoutClient = new CaptivateIQClient({ 
      baseUrl: 'https://api.test.captivateiq.com/ciq/v1', 
      apiToken: 'test-token',
      timeout: 100 
    });
    
    // Create a fetch that never resolves
    const fetchPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 200)
    );
    (global.fetch as any).mockImplementation(() => fetchPromise);
    
    await expect(timeoutClient.listPlans()).rejects.toThrow();
  });

  it('should handle invalid JSON responses', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON')),
      text: () => Promise.resolve('not json')
    });
    
    await expect(client.listPlans()).rejects.toThrow('Invalid JSON');
  });
});
