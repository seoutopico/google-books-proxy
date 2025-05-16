
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Obtener parámetros (soporta GET y POST)
    const isbn = req.query.isbn || (req.body && req.body.isbn);
    
    if (!isbn) {
      return res.status(400).json({ error: 'El parámetro ISBN es obligatorio' });
    }
    
    // Limpiar ISBN
    const isbnLimpio = isbn.replace(/-/g, '').trim();
    
    // User-Agent aleatorio (similar a tu implementación Python)
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'
    ];
    
    const headers = {
      'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Connection': 'keep-alive',
      'Cache-Control': 'max-age=0'
    };
    
    // URL de Google Books API
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbnLimpio}`;
    
    // Realizar solicitud a Google Books
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    // Solo extraer la fecha de publicación si existe
    let publishedDate = null;
    
    if (data.totalItems > 0 && data.items && data.items[0] && data.items[0].volumeInfo) {
      publishedDate = data.items[0].volumeInfo.publishedDate || null;
    }
    
    // Devolver un objeto simplificado con solo la fecha y fuente
    return res.status(200).json({
      isbn: isbnLimpio,
      fecha: publishedDate,
      fuente: publishedDate ? 'Google Books' : null,
      rawData: data // Incluir datos completos para depuración
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Error al comunicarse con la API de Google Books',
      details: error.message 
    });
  }
};
