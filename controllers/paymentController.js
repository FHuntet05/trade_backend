// backend/controllers/paymentController.js
const { ethers } = require('ethers');
// CORRECCIÓN: La forma correcta de importar la clase TronWeb es desestructurándola del objeto que exporta la librería.
const { TronWeb } = require('tronweb'); 
const CryptoWallet = require('../models/cryptoWalletModel');

// --- 1. CONFIGURACIÓN DE LA WALLET MAESTRA (HD WALLET) ---
// Se crea un nodo maestro a partir de la frase semilla secreta.
// Este nodo es la raíz de la que derivarán todas las demás direcciones.
const hdNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);

// --- 2. CONFIGURACIÓN DE TRONWEB ---
// Para Tron, necesitamos una clave privada para instanciar la librería.
// Para mantener la seguridad y la estructura HD, derivamos una clave privada específica para Tron
// desde nuestro nodo maestro. Usamos una ruta de derivación estándar (m/44'/195'/0'/0/0).
const tronMainPrivateKey = hdNode.derivePath(`m/44'/195'/0'/0/0`).privateKey;

// Se instancia TronWeb con la configuración necesaria para conectarse a la red Tron.
// Esta instancia se usará para convertir claves privadas en direcciones de Tron.
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
    privateKey: tronMainPrivateKey
});

/**
 * Controlador para generar o recuperar una dirección de depósito para un usuario.
 * Es idempotente: si una dirección ya existe para el usuario y la cadena, la devuelve.
 * Si no existe, crea una nueva, la guarda y la devuelve.
 */
const generateAddress = async (req, res) => {
  // Se obtiene la cadena ('BSC' o 'TRON') del cuerpo de la solicitud
  const { chain } = req.body;
  // Se obtiene el ID del usuario del token JWT (inyectado por el middleware de autenticación)
  const userId = req.user.id;

  if (!chain) {
    return res.status(400).json({ message: 'Se requiere la cadena (chain).' });
  }

  try {
    // a. Buscar si ya existe una wallet para este usuario y esta cadena.
    let wallet = await CryptoWallet.findOne({ user: userId, chain });

    if (wallet) {
      // Si se encuentra, se devuelve la dirección existente. No se crea una nueva.
      return res.status(200).json({ address: wallet.address });
    }

    // b. Si no existe, se procede a generar una nueva.
    // Se busca el último índice de derivación usado para asegurar la unicidad.
    const lastWallet = await CryptoWallet.findOne().sort({ derivationIndex: -1 });
    const newIndex = lastWallet ? lastWallet.derivationIndex + 1 : 0;
    
    let newAddress;
    
    // c. Lógica de derivación específica para cada cadena.
    if (chain === 'BSC') {
      // Para BSC (y otras redes EVM), se usa la ruta de derivación estándar m/44'/60'/0'/0/i
      const derivedNode = hdNode.derivePath(`m/44'/60'/0'/0/${newIndex}`);
      newAddress = derivedNode.address;
    } else if (chain === 'TRON') {
      // Para TRON, se usa su ruta de derivación estándar m/44'/195'/0'/0/i
      const childNode = hdNode.derivePath(`m/44'/195'/0'/0/${newIndex}`);
      
      // La clave privada de ethers.js incluye un prefijo "0x", que debe ser eliminado para tronWeb.
      const privateKeyWithoutPrefix = childNode.privateKey.substring(2);
      
      // Se usa la instancia de tronWeb para obtener la dirección a partir de la clave privada derivada.
      const accountAddress = await tronWeb.address.fromPrivateKey(privateKeyWithoutPrefix);
      newAddress = accountAddress;
    } else {
      // Si la cadena no es soportada, se devuelve un error.
      return res.status(400).json({ message: 'Cadena no soportada.' });
    }
    
    // d. Guardar la nueva wallet generada en la base de datos.
    wallet = new CryptoWallet({
      user: userId,
      chain,
      address: newAddress,
      derivationIndex: newIndex,
    });
    await wallet.save();

    // e. Devolver la nueva dirección al frontend.
    res.status(201).json({ address: newAddress });

  } catch (error) {
    // Manejo de errores. Si algo falla, se loguea y se devuelve un error 500.
    console.error('Error al generar la dirección de depósito:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
};

module.exports = {
  generateAddress,
};