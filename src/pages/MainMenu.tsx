import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function MainMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-12"
      >
        <h1 className="text-6xl font-bold text-amber-400 mb-2 tracking-wider" style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
          ⚔️ СРЕДНЕВЕКОВЫЕ ВОЙНЫ ⚔️
        </h1>
        <p className="text-gray-400 text-lg mt-4">Выберите битву</p>
      </motion.div>

      <div className="flex flex-col md:flex-row gap-8 max-w-4xl">
        {/* Game 1 */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="bg-gray-800/80 border-2 border-amber-700 rounded-xl p-8 w-80 cursor-pointer hover:border-amber-400 hover:scale-105 transition-all duration-300 shadow-2xl"
          onClick={() => navigate('/game1')}
        >
          <div className="text-5xl mb-4 text-center">🏰</div>
          <h2 className="text-2xl font-bold text-amber-300 text-center mb-3" style={{ fontFamily: 'serif' }}>
            Королевства
          </h2>
          <p className="text-gray-300 text-sm text-center mb-4">
            Классическая RTS. Собирайте ресурсы, стройте базу, обучайте армию и уничтожьте вражеское королевство!
          </p>
          <div className="text-xs text-gray-500 text-center space-y-1">
            <p>🪙 Золото • 🪵 Дерево • 🌾 Еда</p>
            <p>⚔️ Мечники • 🏹 Лучники • 👷 Крестьяне</p>
          </div>
          <div className="mt-4 bg-amber-700 hover:bg-amber-600 text-white text-center py-2 rounded-lg font-bold transition-colors">
            ИГРАТЬ
          </div>
        </motion.div>

        {/* Game 2 */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="bg-gray-800/80 border-2 border-red-700 rounded-xl p-8 w-80 cursor-pointer hover:border-red-400 hover:scale-105 transition-all duration-300 shadow-2xl"
          onClick={() => navigate('/game2')}
        >
          <div className="text-5xl mb-4 text-center">🏯</div>
          <h2 className="text-2xl font-bold text-red-300 text-center mb-3" style={{ fontFamily: 'serif' }}>
            Осада Замка
          </h2>
          <p className="text-gray-300 text-sm text-center mb-4">
            Защищайте свой замок и разрушьте вражеский! Стройте стены, отправляйте войска и осадные орудия.
          </p>
          <div className="text-xs text-gray-500 text-center space-y-1">
            <p>🧱 Стены • 🗼 Башни • 🏗️ Осадные орудия</p>
            <p>🐴 Кавалерия • 🪜 Лестницы • 💣 Катапульты</p>
          </div>
          <div className="mt-4 bg-red-700 hover:bg-red-600 text-white text-center py-2 rounded-lg font-bold transition-colors">
            ИГРАТЬ
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-12 text-gray-600 text-sm text-center"
      >
        <p>Управление: ЛКМ - выбор/действие • ПКМ - перемещение/атака</p>
        <p className="mt-1">Клавиши 1-5 для выбора зданий для постройки</p>
      </motion.div>
    </div>
  );
}
