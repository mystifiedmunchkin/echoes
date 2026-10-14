jest.mock('../src/services/auth', () => ({
  getAuthToken: jest.fn().mockResolvedValue('test-token'),
}));
jest.mock('../constants/i18n', () => ({
  translate: (key) => key,
}));

import { createMemory } from '../src/services/api';

describe('createMemory', () => {
  const originalXMLHttpRequest = global.XMLHttpRequest;
  const originalFormData = global.FormData;
  let request;

  beforeEach(() => {
    request = null;
    global.FormData = jest.fn().mockImplementation(() => {
      const parts = [];
      return {
        append: (name, value) => parts.push([name, value]),
        getParts: () => parts.map(([fieldName, value]) => (
          typeof value === 'string'
            ? { fieldName, string: value }
            : { ...value, fieldName }
        )),
      };
    });
    global.XMLHttpRequest = jest.fn().mockImplementation(() => {
      request = {
        headers: {},
        open: jest.fn(),
        setRequestHeader: jest.fn((name, value) => {
          request.headers[name] = value;
        }),
        send: jest.fn((body) => {
          request.body = body;
          request.status = 201;
          request.responseText = '{"id":1}';
          request.onload();
        }),
      };
      return request;
    });
  });

  afterAll(() => {
    global.XMLHttpRequest = originalXMLHttpRequest;
    global.FormData = originalFormData;
  });

  it('uploads local media through XMLHttpRequest without overriding multipart headers', async () => {
    const result = await createMemory({
      title: 'A memory',
      description: '',
      latitude: 48.86,
      longitude: 2.35,
      mediaAssets: [{
        uri: 'file:///tmp/photo.jpg',
        type: 'image',
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
      }],
    });

    expect(result).toEqual({ id: 1 });
    expect(request.open).toHaveBeenCalledWith(
      'POST',
      'https://echoes.sophiehorner.art/api/memories',
    );
    expect(request.headers.Accept).toBe('application/json');
    expect(request.headers.Authorization).toBe('Bearer test-token');
    expect(request.headers['Content-Type']).toBeUndefined();
    expect(request.body.getParts()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uri: 'file:///tmp/photo.jpg',
        name: 'photo.jpg',
        type: 'image/jpeg',
      }),
    ]));
  });
});
