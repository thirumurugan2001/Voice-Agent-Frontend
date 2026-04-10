
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css'
import VoiceChatbot from './component/VoiceChatbot';

function App() {
  return (
    <Router>
      <>
        <Routes>
          <Route path="/" element={<VoiceChatbot />} />
        </Routes>
      </>
    </Router>
  );
}

export default App;