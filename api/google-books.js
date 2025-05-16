const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Establecer headers CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Obtener parámetros de la consulta
    const { q, maxResults = 10, ...otherParams } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'El parámetro "q" es obligatorio' });
    }
    
    // Construir URL para la API de Google Books
    const baseUrl = "https://www.googleapis.com/books/v1/volumes";
    const params = new URLSearchParams({
      q,
      maxResults,
      ...otherParams
    });
    
    // Realizar la solicitud a la API
    const response = await fetch(`${baseUrl}?${params.toString()}`);
    const data = await response.json();
    
    // Devolver los resultados
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ 
      error: 'Error al comunicarse con la API de Google Books',
      details: error.message
    });
  }
};
