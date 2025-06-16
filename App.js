import React, { useState, useEffect, useCallback } from 'react'; // useCallback 추가
import useSpeechRecognition from './useSpeechRecognition';
import './App.css';
import dwaejiGukbapImg from './img/돼지국밥.png';
import sundaeGukbapImg from './img/순대국밥.png';
import seokkeoGukbapImg from './img/섞어국밥.png';
import suyukImg from './img/수육.jpg';

const BACKEND_URL = 'http://localhost:8000';

const imageMap = {
  '돼지국밥': dwaejiGukbapImg,
  '순대국밥': sundaeGukbapImg,
  '내장국밥': seokkeoGukbapImg,
  '섞어국밥': seokkeoGukbapImg,
  '수육 반접시': suyukImg,
  '수육 한접시': suyukImg,
};

function App() {
  // --- STATES ---
  const [menuItems, setMenuItems] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [conversationState, setConversationState] = useState('IDLE');

  // --- HANDLERS (Define before useSpeechRecognition) ---
  const addToOrder = useCallback((menuItem, quantityToAdd = 1) => {
    setOrderItems(prevOrderItems => {
      const existingItem = prevOrderItems.find(item => item.id === menuItem.id);
      if (existingItem) {
        return prevOrderItems.map(item =>
          item.id === menuItem.id ? { ...item, quantity: item.quantity + quantityToAdd } : item
        );
      } else {
        if (!menuItem || typeof menuItem.id === 'undefined') {
          console.error("Attempted to add invalid menuItem:", menuItem);
          return prevOrderItems;
        }
        return [...prevOrderItems, { ...menuItem, quantity: quantityToAdd }];
      }
    });
  }, []); // Empty dependency array for useCallback as addToOrder doesn't depend on other state/props from App scope

  const handleVoiceResult = useCallback(async (voiceInputText) => {
    if (!voiceInputText || voiceInputText.trim() === "" || isProcessingVoice) return;

    setIsProcessingVoice(true);
    console.log(`[${conversationState}] Recognized: ${voiceInputText}`);

    try {
      // Ensure stopListening is called before making a new request if it wasn't handled by the hook
      // if (isListening) stopListening(); // This might be needed depending on hook's behavior

      const response = await fetch(`${BACKEND_URL}/process-voice-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: voiceInputText }),
      });

      if (!response.ok) throw new Error('Backend request failed');
      const data = await response.json();

      console.log('Backend response:', data); // 디버깅용 로그 추가

      switch (data.status) {
        case 'order_processed':
          let itemsAddedMessage = [];
          Object.keys(data.order).forEach(itemName => {
            const quantity = data.order[itemName];
            const menuItemDetails = menuItems.find(mi => mi.name === itemName);
            if (menuItemDetails && quantity > 0) {
              addToOrder(menuItemDetails, quantity);
              itemsAddedMessage.push(`${itemName} ${quantity}개`);
            }
          });
          openModal('주문 추가 완료', `네, 알겠습니다! ${itemsAddedMessage.join(', ')} 주문목록에 추가되었습니다! 혹시 다른 메뉴는 필요 없으신가요?`);
          // 3초 후에 추가 주문 대기 상태로 전환
          setTimeout(() => {
            closeModal();
            setConversationState('AWAITING_FOLLOW_UP');
          }, 3000);
          break;
        case 'answered':
          openModal('답변', data.message);
          setConversationState('SHOWING_ANSWER');
          break;
        case 'staff_called':
          openModal('직원 호출', data.message);
          setConversationState('CALLING_STAFF');
          break;
        case 'order_completed':
          setConversationState('FINALIZING');
          openModal('주문 완료', '네 알겠습니다! 맛있게 준비해드리겠습니다');
          break;
        case 'order_cancelled':
          setConversationState('IDLE');
          setOrderItems([]); // 주문 내역 초기화
          openModal('주문 취소', data.message || '주문이 취소되었습니다. 처음 화면으로 돌아갑니다.');
          break;
        default:
          openModal('오류', '죄송합니다, 잘 이해하지 못했어요. 다시 말씀해주시겠어요?');
          setConversationState('LISTENING');
          break;
      }
    } catch (error) {
      console.error("Voice processing error:", error);
      openModal('오류', '요청 처리 중 오류가 발생했습니다.');
      setConversationState('IDLE');
    } finally {
      setIsProcessingVoice(false);
    }
  }, [conversationState, isProcessingVoice, menuItems, addToOrder]); // Added dependencies for useCallback

  // --- HOOKS (useSpeechRecognition must be after handleVoiceResult is defined) ---
  const { isListening, startListening, stopListening } = useSpeechRecognition({ onResult: handleVoiceResult });

  // --- MODAL FUNCTIONS (Can be defined after hooks if they don't use them directly at definition) ---
  const openModal = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    if (conversationState === 'SHOWING_ANSWER') {
      setConversationState('LISTENING');
    } else if (conversationState === 'FINALIZING' || conversationState === 'CALLING_STAFF') {
      setConversationState('IDLE');
      if(conversationState === 'FINALIZING') setOrderItems([]);
    }
  };
  
  // --- LIFECYCLE & STATE MACHINE (useEffect for conversation state changes) ---
  useEffect(() => {
    switch (conversationState) {
      case 'GREETING':
        openModal('음성 주문', '안녕하세요, 손님, 오늘은 무엇을 주문하실건가요?');
        const greetingTimer = setTimeout(() => {
          closeModal();
          setConversationState('LISTENING');
        }, 1500);
        return () => clearTimeout(greetingTimer);
      case 'LISTENING':
      case 'AWAITING_FOLLOW_UP':
        if (!isListening && !isProcessingVoice) {
          startListening();
        }
        break;
      case 'CALLING_STAFF': // Modal is opened by handleVoiceResult, here we just handle timeout to IDLE
        const staffTimer = setTimeout(() => {
          closeModal(); // This will also trigger transition to IDLE via closeModal logic
        }, 3000);
        return () => clearTimeout(staffTimer);
      case 'IDLE':
      case 'FINALIZING': // Modal is opened by handleVoiceResult/completeOrder, then transitions to IDLE via closeModal
        if (isListening) stopListening();
        break;
      default:
        if (isListening) stopListening();
        break;
    }
  }, [conversationState, isListening, isProcessingVoice, startListening, stopListening]); // Added dependencies

  // Initial menu fetch
  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/menu`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const backendMenuItems = data.menu_items;
        const formattedMenuItems = Object.keys(backendMenuItems).map((name, index) => ({
          id: index + 1,
          name: name,
          price: backendMenuItems[name],
          image: imageMap[name] || null
        }));
        setMenuItems(formattedMenuItems);
      } catch (error) {
        console.error("Failed to fetch menu:", error);
      }
    };
    fetchMenu();
  }, []);

  // --- UI HANDLERS ---
  const toggleVoiceMode = () => {
    if (conversationState === 'IDLE') {
      setConversationState('GREETING');
    }
  };

  const completeOrder = () => {
    if (orderItems.length === 0) {
      openModal('주문 오류', '주문할 메뉴를 선택해주세요.');
      return;
    }
    const orderSummary = orderItems.map(item => `${item.name} ${item.quantity}개`).join('\n');
    const total = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (window.confirm(`주문을 완료하시겠습니까?\n\n주문 내역:\n${orderSummary}\n\n총 금액: ${total.toLocaleString()}원`)) {
      openModal('주문 완료', '주문이 완료되었습니다! 감사합니다.');
      setOrderItems([]);
      setConversationState('IDLE'); // Transition to IDLE after order completion
    }
  };

  const totalAmount = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // --- RENDER ---
  return (
    <div className="container">
      <header>
        <h1>24시돼지국밥</h1>
      </header>

      <main className="menu-grid">
        {menuItems.map(item => (
          <div key={item.id} className="menu-item" onClick={() => addToOrder(item)}>
            <div className="menu-image">
              {item.image ? (
                <img src={item.image} alt={item.name} style={{ width: '100%', height: '100px', objectFit: 'cover' }} />
              ) : (
                <div className="placeholder-image"></div> 
              )}
            </div>
            <div className="menu-info">
              <h3>{item.name}</h3>
              <p>{item.price.toLocaleString()}원</p>
            </div>
          </div>
        ))}
      </main>

      <div className="order-section">
        <div className="order-list">
          <h3>주문 목록</h3>
          <div className="order-items">
            {orderItems.map(item => (
              <div key={item.id} className="order-item">
                <div className="order-item-details">
                  <span className="order-item-name">{item.name} x{item.quantity}</span>
                  <span className="order-item-price">{(item.price * item.quantity).toLocaleString()}원</span>
                </div>
              </div>
            ))}
          </div>
          <div className="total-amount">
            <span>최종 금액</span>
            <span className="amount">{totalAmount.toLocaleString()}원</span>
          </div>
        </div>
      </div>

      {(isListening || isProcessingVoice) && (
        <div className="voice-mode-indicator active">
          <span className="material-icons mic-pulse">mic</span>
          <p>{isListening ? '음성 인식 중...' : (isProcessingVoice ? '주문 처리 중...' : '음성 주문 시작 중...')}</p>
        </div>
      )}

      <div className="action-buttons">
        <button className="btn voice-order" onClick={toggleVoiceMode} disabled={isListening || isProcessingVoice || conversationState !== 'IDLE'}>
          <span className="material-icons">mic_none</span>
          음성 주문
        </button>
        <button className="btn complete-order" onClick={completeOrder}>
          <span className="material-icons">check_circle</span>
          주문 완료
        </button>
      </div>

      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{modalTitle}</h3>
              <button onClick={closeModal} className="modal-close-button">&times;</button>
            </div>
            <div className="modal-body">
              {modalMessage.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
            <div className="modal-footer">
              <button onClick={closeModal} className="btn">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;