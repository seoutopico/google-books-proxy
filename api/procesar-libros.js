const { GoogleSpreadsheet } = require('google-spreadsheet');
const fetch = require('node-fetch');

// Variables para estadísticas
let stats = {
  procesados: 0,
  encontradosIndice: 0,
  encontradosGoogle: 0,
  encontradosOpenLibrary: 0,
  noEncontrados: 0
};

module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Obtener parámetros de la URL
    const { spreadsheet_id = process.env.DEFAULT_SPREADSHEET_ID, 
            hoja_nombre = process.env.DEFAULT_HOJA_NOMBRE,
            max_isbn } = req.query;
    
    if (!spreadsheet_id) {
      return res.status(400).json({ 
        error: 'Se requiere el ID de la hoja de cálculo (spreadsheet_id)' 
      });
    }

    console.log(`Iniciando proceso para la hoja: ${spreadsheet_id} / ${hoja_nombre}`);
    
    // Reiniciar estadísticas
    stats = {
      procesados: 0,
      encontradosIndice: 0,
      encontradosGoogle: 0,
      encontradosOpenLibrary: 0,
      noEncontrados: 0
    };
    
    // Crear instancia del scraper
    const scraper = new ScraperMultiApi(spreadsheet_id, hoja_nombre);
    
    // Inicializar
    await scraper.inicializar();
    
    // Ejecutar la estrategia
    const resultado = await scraper.ejecutarEstrategia(max_isbn ? parseInt(max_isbn) : null);
    
    // Devolver resultado
    return res.status(200).json({
      mensaje: "Proceso completado con éxito",
      estadisticas: resultado
    });
    
  } catch (error) {
    console.error(`Error general: ${error.message}`);
    return res.status(500).json({
      error: 'Error al procesar la solicitud',
      mensaje: error.message,
      detalles: error.stack
    });
  }
};

// Clase principal como tu versión de Python
class ScraperMultiApi {
  constructor(spreadsheetId, hojaNombre) {
    this.spreadsheetId = spreadsheetId;
    this.hojaNombre = hojaNombre || 'Kobo';
    this.hojaIndice = 'indice';
    this.indice = {};
    this.doc = null;
    this.sheet = null;
    this.sheetIndice = null;
  }
  
  async inicializar() {
    try {
      // Crear cliente de Google Sheets
      this.doc = new GoogleSpreadsheet(this.spreadsheetId);
      
      // Autenticar con credenciales
      await this.doc.useServiceAccountAuth({
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      });
      
      // Cargar información del documento
      await this.doc.loadInfo();
      console.log(`✅ Conectado a Google Sheets: ${this.doc.title}`);
      
      // Obtener hoja principal
      this.sheet = this.doc.sheetsByTitle[this.hojaNombre];
      if (!this.sheet) {
        throw new Error(`No se encontró la hoja "${this.hojaNombre}"`);
      }
      
      // Obtener o crear hoja de índice
      this.sheetIndice = this.doc.sheetsByTitle[this.hojaIndice];
      if (!this.sheetIndice) {
        this.sheetIndice = await this.doc.addSheet({
          title: this.hojaIndice,
          headerValues: ['ISBN', 'Fecha', 'Fuente', 'Fecha_Busqueda']
        });
        console.log(`✅ Hoja "${this.hojaIndice}" creada`);
      } else {
        console.log(`✅ Usando hoja "${this.hojaIndice}" existente`);
      }
      
      // Cargar índice
      await this.cargarIndice();
      
    } catch (error) {
      console.error(`Error inicializando: ${error.message}`);
      throw error;
    }
  }
  
  async cargarIndice() {
    try {
      // Obtener filas de la hoja de índice
      const rows = await this.sheetIndice.getRows();
      
      // Procesar cada fila
      for (const row of rows) {
        const isbn = row.ISBN?.trim();
        const fecha = row.Fecha?.trim();
        
        if (isbn && fecha) {
          this.indice[isbn] = fecha;
        }
      }
      
      console.log(`📚 Índice cargado: ${Object.keys(this.indice).length} ISBNs almacenados`);
    } catch (error) {
      console.error(`⚠️ Error cargando índice: ${error.message}`);
      this.indice = {};
    }
  }
  
  async buscarEnGoogleBooks(isbn) {
    try {
      // Limpiar ISBN
      const isbnLimpio = isbn.replace(/-/g, '').trim();
      
      // User-Agent aleatorio
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
      ];
      
      const headers = {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'application/json',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      };
      
      // Pausa aleatoria
      const pausa = Math.random() * 1500 + 1500; // 1.5 a 3 segundos
      console.log(`⏱️ Pausa Google Books: ${(pausa/1000).toFixed(1)}s`);
      await new Promise(resolve => setTimeout(resolve, pausa));
      
      // Realizar la solicitud
      const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbnLimpio}`;
      const response = await fetch(url, { headers });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.totalItems > 0 && data.items && data.items[0].volumeInfo) {
          const fecha = data.items[0].volumeInfo.publishedDate;
          
          if (fecha) {
            return { fecha, fuente: 'Google Books' };
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Error en Google Books: ${error.message}`);
      return null;
    }
  }
  
  async buscarEnOpenLibrary(isbn) {
    try {
      // Limpiar ISBN
      const isbnLimpio = isbn.replace(/-/g, '').trim();
      
      // User-Agent aleatorio
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
      ];
      
      const headers = {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'application/json',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      };
      
      // Pausa aleatoria
      const pausa = Math.random() * 1500 + 1500; // 1.5 a 3 segundos
      console.log(`⏱️ Pausa Open Library: ${(pausa/1000).toFixed(1)}s`);
      await new Promise(resolve => setTimeout(resolve, pausa));
      
      // Realizar la solicitud
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbnLimpio}&format=json&jscmd=data`;
      const response = await fetch(url, { headers });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data[`ISBN:${isbnLimpio}`]) {
          const fecha = data[`ISBN:${isbnLimpio}`].publish_date;
          
          if (fecha) {
            return { fecha, fuente: 'Open Library' };
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Error en Open Library: ${error.message}`);
      return null;
    }
  }
  
  async guardarEnIndice(isbn, fecha, fuente) {
    try {
      // Fecha actual
      const fechaActual = new Date().toISOString();
      
      // Añadir a la hoja de índice
      await this.sheetIndice.addRow({
        ISBN: isbn,
        Fecha: fecha,
        Fuente: fuente,
        Fecha_Busqueda: fechaActual
      });
      
      // Actualizar en memoria
      this.indice[isbn] = fecha;
      
      console.log(`✅ Guardado en índice (fuente: ${fuente})`);
    } catch (error) {
      console.error(`⚠️ Error al guardar en índice: ${error.message}`);
    }
  }
  
  async procesarIsbn(fila, isbn, filaIndex) {
    // PASO 1: Verificar en el índice primero
    if (isbn in this.indice) {
      const fecha = this.indice[isbn];
      console.log(`✅ Encontrado en índice: ${fecha}`);
      
      // Actualizar la celda con la fecha
      await this.sheet.loadCells(`B${filaIndex}:B${filaIndex}`);
      const cell = this.sheet.getCell(filaIndex - 1, 1); // -1 porque los índices empiezan en 0
      cell.value = fecha;
      await this.sheet.saveUpdatedCells();
      
      stats.encontradosIndice++;
      return { encontrado: true, fuente: 'índice' };
    }
    
    // PASO 2: Buscar en Google Books
    console.log(`🔍 Buscando en Google Books...`);
    const resultadoGoogle = await this.buscarEnGoogleBooks(isbn);
    
    if (resultadoGoogle) {
      const { fecha, fuente } = resultadoGoogle;
      console.log(`✅ Encontrado en ${fuente}: ${fecha}`);
      
      // Actualizar la celda con la fecha
      await this.sheet.loadCells(`B${filaIndex}:B${filaIndex}`);
      const cell = this.sheet.getCell(filaIndex - 1, 1); // -1 porque los índices empiezan en 0
      cell.value = fecha;
      await this.sheet.saveUpdatedCells();
      
      // Guardar en índice
      await this.guardarEnIndice(isbn, fecha, fuente);
      
      stats.encontradosGoogle++;
      return { encontrado: true, fuente };
    }
    
    // PASO 3: Si no está en Google Books, buscar en Open Library
    console.log(`🔍 No encontrado en Google Books, buscando en Open Library...`);
    const resultadoOpenLibrary = await this.buscarEnOpenLibrary(isbn);
    
    if (resultadoOpenLibrary) {
      const { fecha, fuente } = resultadoOpenLibrary;
      console.log(`✅ Encontrado en ${fuente}: ${fecha}`);
      
      // Actualizar la celda con la fecha
      await this.sheet.loadCells(`B${filaIndex}:B${filaIndex}`);
      const cell = this.sheet.getCell(filaIndex - 1, 1); // -1 porque los índices empiezan en 0
      cell.value = fecha;
      await this.sheet.saveUpdatedCells();
      
      // Guardar en índice
      await this.guardarEnIndice(isbn, fecha, fuente);
      
      stats.encontradosOpenLibrary++;
      return { encontrado: true, fuente };
    }
    
    // Si no se encuentra en ningún lugar
    console.log(`❌ No encontrado en ninguna API`);
    stats.noEncontrados++;
    return { encontrado: false };
  }
  
  async obtenerPendientes() {
    // Cargar todas las filas
    const rows = await this.sheet.getRows();
    const pendientes = [];
    
    // Procesar cada fila
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const isbn = row[this.sheet.headerValues[0]]?.trim(); // Primera columna (ISBN)
      const fecha = row[this.sheet.headerValues[1]]?.trim(); // Segunda columna (Fecha)
      
      // Es pendiente si tiene ISBN pero no fecha
      if (isbn && !fecha) {
        pendientes.push({
          fila: i + 2, // +2 porque los índices empiezan en 0 y hay que contar el encabezado
          isbn
        });
      }
    }
    
    return pendientes;
  }
  
  async ejecutarEstrategia(maxIsbn) {
    console.log("=".repeat(50));
    console.log("SCRAPER MULTI-API (Google Books + Open Library)");
    console.log("=".repeat(50));
    
    // Obtener ISBNs pendientes
    const pendientes = await this.obtenerPendientes();
    const total = pendientes.length;
    console.log(`\n📚 ${total} ISBNs pendientes`);
    
    // Limitar cantidad si se especifica
    let isbnsProcesar = pendientes;
    if (maxIsbn && maxIsbn < total) {
      isbnsProcesar = pendientes.slice(0, maxIsbn);
      console.log(`⚠️ Limitando a ${maxIsbn} ISBNs`);
    }
    
    // Procesar cada ISBN
    for (let i = 0; i < isbnsProcesar.length; i++) {
      const { fila, isbn } = isbnsProcesar[i];
      console.log(`\n[${i+1}/${isbnsProcesar.length}] ISBN ${isbn} (fila ${fila})`);
      
      // Procesar el ISBN
      await this.procesarIsbn(i, isbn, fila);
      
      stats.procesados++;
      
      // Pausa extra cada 5 ISBNs para evitar bloqueos
      if ((i + 1) % 5 === 0 && i < isbnsProcesar.length - 1) {
        const pausaExtra = Math.random() * 7000 + 8000; // 8 a 15 segundos
        console.log(`\n⏱️ Pausa adicional: ${(pausaExtra/1000).toFixed(1)}s`);
        await new Promise(resolve => setTimeout(resolve, pausaExtra));
      }
    }
    
    // Resumen final
    console.log("\n" + "=".repeat(50));
    console.log("RESUMEN FINAL");
    console.log("=".repeat(50));
    console.log(`Total pendientes: ${total}`);
    console.log(`Procesados: ${isbnsProcesar.length}`);
    console.log(`✅ Encontrados en índice: ${stats.encontradosIndice}`);
    console.log(`✅ Encontrados en Google Books: ${stats.encontradosGoogle}`);
    console.log(`✅ Encontrados en Open Library: ${stats.encontradosOpenLibrary}`);
    console.log(`❌ No encontrados: ${stats.noEncontrados}`);
    console.log(`📚 Total en índice: ${Object.keys(this.indice).length}`);
    console.log("=".repeat(50));
    
    return stats;
  }
}
