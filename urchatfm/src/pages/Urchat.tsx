import React, { useCallback, useEffect, useState } from 'react';
import useUrchatStore from '../useUrchatStore';
import { IncomingCall } from '../components/IncomingCall';
import { Route, Switch, useHistory } from 'react-router';
import { Chat } from '../components/Chat';
import { Call } from '../components/Call';
import { Dialer } from '../components/Dialer';
import { useMediaStore } from '../useMediaStore';
import { useMock } from '../util';
import call from '/src/assets/enter-call.wav';
import { TurnOnRinger } from '../components/TurnOnRinger';
import { SecureWarning } from '../components/SecureWarning';

export interface Message {
  speaker: string;
  message: string;
}

export function Urchat() {
  const {
    incomingCall,
    ongoingCall,
    answerCall: answerCallState,
    placeCall: placeCallState,
    rejectCall,
    hangup
  } = useUrchatStore();
  const getDevices = useMediaStore(s => s.getDevices);
  const { push } = useHistory();

  // local state
  const [dataChannel, setDataChannel] = useState(null);
  const [dataChannelOpen, setDataChannelOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const isSecure = location.protocol.startsWith('https') || location.hostname === 'localhost';

  // Set up callback to update device lists when a new device is added or removed

  useEffect(() => {
    window.addEventListener('beforeunload', hangup)
    return () => window.removeEventListener('beforeunload', hangup)
  }, [])

  useEffect(() => {
    if (isSecure && ongoingCall) {
      const audio = new Audio(call);
      audio.volume = .3
      audio.play();
      push(`/chat/${ongoingCall.conn.uuid}`)

      const updateDevices = () => getDevices(ongoingCall);
      navigator.mediaDevices.addEventListener('devicechange', updateDevices);
      return () => navigator.mediaDevices.removeEventListener('devicechange', updateDevices);
    }
  }, [ongoingCall]);

  // state-changing methods
  const answerCall = async () => {
    const call = await answerCallState((peer, conn) => {
      setDataChannelOpen(false);
      setMessages([]);
      conn.addEventListener('datachannel', (evt) => {
        const channel = evt.channel;
        channel.onopen = () => setDataChannelOpen(true);
        channel.onmessage = (evt) => {
          const data = evt.data;
          setMessages(messages => [{ speaker: peer, message: data }].concat(messages));
          console.log('channel message', data);
        };
        setDataChannel(channel);
      });
    });

    getDevices(call)
  }

  const placeCall = async ship => {
    const call = await placeCallState(ship, (conn) => {
      console.log('placing call');
      setDataChannelOpen(false);
      setMessages([]);
      const channel = conn.createDataChannel('urchatfm');
      channel.onopen = () => setDataChannelOpen(true);
      channel.onmessage= (evt) => {
        const data = evt.data;
        setMessages(messages => [{ speaker: ship, message: data }].concat(messages));
        console.log('channel message', data);
      };
      setDataChannel(channel);
    });

    getDevices(call)
  }

  const sendMessage = useCallback((msg: string) => {
    if (!useMock) {
      dataChannel?.send(msg);
    }
    
    const newMessages = [{ speaker: 'me', message: msg }].concat(messages);
    console.log(messages, newMessages);
    setMessages(newMessages);
  }, [messages]);

  return (
    <main className="relative flex flex-col lg:flex-row lg:gap-6 w-full h-full lg:p-8 text-gray-700">
      <section className="flex-auto lg:flex-1 flex flex-col justify-center h-[50%] lg:h-auto">
        <Switch>
          <Route path="/chat/:id" component={Call} />
          <Route path="/">
            <div className="flex justify-center items-center w-full h-full bg-pink-100 rounded-xl">
              <div>
                <h1 className="mb-6 mx-12 text-3xl font-semibold font-mono">urChatFM</h1>
                <Dialer placeCall={placeCall} />
              </div>
            </div>
          </Route>
        </Switch>
      </section>
      <aside className="flex-auto lg:flex-none lg:w-[33vw] lg:max-w-sm h-[50%] lg:h-auto">
        <Switch>
          <Route path="/chat/:id">
            <Chat sendMessage={sendMessage} messages={messages} ready={dataChannelOpen} />
          </Route>
          <Route path="/">
            <div className="h-full bg-gray-300 lg:rounded-xl" />
          </Route>
        </Switch>
      </aside>
      
      {incomingCall && (
        <IncomingCall caller={incomingCall.call.peer} answerCall={answerCall} rejectCall={rejectCall} />
      )}
      {isSecure && <TurnOnRinger />}
      {!isSecure && <SecureWarning />}
    </main>
  )
}