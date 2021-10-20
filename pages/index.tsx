// TODO: Break this apart lol.
import type { NextPage } from 'next';
import WrappedImage from 'next/image';
import { keyframes } from '@emotion/react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { ethers } from 'ethers';
import abi from '../utils/WavePortal.json';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getCatImageUrl } from '../utils/cats';

function isMobile() {
  return navigator.userAgent.includes('Mobile');
}

const contractAddress = '0xD21B19220949b18F55c8BbfA78728a696f1202dc';
const contractABI = abi.abi;

const fadeInfadeOut = keyframes`
  from {
  	opacity: 0;
  }
  to {
 	opacity: 1;
  }
`;

function getMissingMetamaskMessage() {
  if (isMobile()) {
    return `You are on a mobile device. To continue, open the Metamask application on your device and use the built-in browser to load the site.`;
  } else {
    return 'The Metamask browser extension was not detected. Unable to continue. Ensure the extenson is installed and enabled.';
  }
}

const Image: typeof WrappedImage = ({
  src,
  alt,
  width,
  height,
  layout,
  ...props
}) => {
  const [imageUrl, setImageUrl] = useState(src);

  return (
    <WrappedImage
      src={imageUrl}
      alt={alt}
      width={width}
      height={height}
      layout={layout}
      {...props}
      onError={(error) => {
        setImageUrl('https://http.cat/404');
      }}
    />
  );
};

interface MessageRequest {
  address: string;
  message: string;
  timestamp: { toString(): string };
  imageUrl: string;
}

const MessageCard: React.FC<{
  messageRequest: MessageRequest;
  ref?: React.Ref<HTMLDetailsElement>;
  id?: string;
}> = ({ messageRequest, ref, id }) => {
  const timeStamp: string = messageRequest.timestamp.toString();
  return (
    <details ref={ref} id={id}>
      <summary sx={{ userSelect: 'none', cursor: 'pointer' }}>
        {messageRequest.message}
      </summary>
      <p>
        Sender: <EtherscanLink address={messageRequest.address} />
      </p>
      <p>
        Sent:{' '}
        <time dateTime={timeStamp}>{new Date(timeStamp).toLocaleString()}</time>
      </p>
      <Image
        src={messageRequest.imageUrl}
        alt="Art for this request"
        layout="fixed"
        width="375"
        height="300"
      />
    </details>
  );
};

const EtherscanLink: React.FC<{ address: string }> = ({ address }) => {
  return (
    <a
      sx={{ color: 'lime' }}
      href={`https://etherscan.io/address/${address}`}
      title={`${address} on etherscan.io`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {address}
    </a>
  );
};

const Miner: React.FC<{ transactionId: string }> = ({ transactionId }) => {
  return (
    <>
      <span
        aria-hidden="true"
        sx={{
          opacity: 1,
          '@media screen and (prefers-reduced-motion: no-preference)': {
            animation: `${fadeInfadeOut} 2.5s ease-in-out infinite`,
          },
          marginRight: '0.75rem',
        }}
      >
        💎
      </span>
      {`Mining transaction ${transactionId}`}
    </>
  );
};

// TODO: Improve this.
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  onClick,
  type = 'button',
}) => {
  return (
    <button
      type={type}
      sx={{
        backgroundColor: 'accent',
        color: '#fff',
        borderRadius: '0.5rem',
        border: 'none',
        padding: '0.25rem 0.5rem',
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

const Home: NextPage = () => {
  const [currentAccount, setCurrentAccount] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [artRequests, setAllArtRequests] = useState<any[]>([]);
  const lastMessageRef = useRef<HTMLDetailsElement>(null);

  async function mineTransaction(
    contract: ethers.Contract,
    message: string,
  ): Promise<void> {
    let transactionId: string | undefined;

    try {
      const imageUrl = getCatImageUrl();
      const transaction = await contract.askForArt(message, imageUrl);
      transactionId = transaction.hash;

      toast.info(<Miner transactionId={transaction.hash} />, {
        toastId: transaction.hash,
        autoClose: false,
      });

      await transaction.wait();
    } catch (error: any) {
      if (
        error.message.includes(
          `MetaMask Tx Signature: User denied transaction signature.`,
        )
      ) {
        toast.info(
          'You changed your mind and did not request to see a picture. 😭',
        );
      } else if (error.message.includes('execution reverted: Wait 15m')) {
        toast.warn(
          `Please don't spam. You can send another message after 15 minutes.`,
        );
      } else if (
        error.message.includes(
          `Cannot estimate gas; transaction may fail or may require manual gas limit`,
        )
      ) {
        toast.error(
          `Cannot estimate gas; transaction may fail or may require manual gas limit.`,
        );
      } else if (`Trying to withdraw more money than the contract has`) {
        toast.error(`Contract has no funds for prize! Message rejected.`);
      } else {
        toast.error('an unknown error occurred');
        console.log(error);
      }
    } finally {
      if (transactionId != null) {
        toast.dismiss(transactionId);
      }
    }
  }

  function scrollToLastMessage() {
    const { current: lastMessage } = lastMessageRef;

    lastMessage?.setAttribute('open', 'true');
    lastMessage?.scrollIntoView({
      behavior: 'smooth',
    });
  }

  /*
   * Create a method that gets all waves from your contract
   */
  const getArtRequests = useCallback(async () => {
    try {
      const { ethereum } = window;

      if (ethereum) {
        const provider = new ethers.providers.Web3Provider(ethereum);
        const signer = provider.getSigner();
        const wavePortalContract = new ethers.Contract(
          contractAddress,
          contractABI,
          signer,
        );

        /*
         * Call the getArtRequests method from your Smart Contract
         */
        const rawArtRequests = await wavePortalContract.getArtRequests();

        /*
         * We only need address, timestamp, and message in our UI so let's
         * pick those out
         */
        const artRequests = rawArtRequests.map((artRequest: any) => {
          return {
            address: artRequest.waver,
            timestamp: new Date(artRequest.timestamp * 1000),
            message: artRequest.message,
            imageUrl: artRequest.imageUrl,
          };
        });

        /*
         * Store our data in React State
         */
        setAllArtRequests(artRequests);

        wavePortalContract.on(
          'NewWave',
          (from, timestamp, message, imageUrl) => {
            console.log('NewWave', from, timestamp, message, imageUrl);

            setAllArtRequests((prevState) => [
              ...prevState,
              {
                address: from,
                timestamp: new Date(timestamp * 1000),
                message,
                imageUrl,
              },
            ]);

            toast.success(
              <>
                <span sx={{ margin: '0.5rem' }}>{message}</span>
                <Button onClick={scrollToLastMessage}>View new message</Button>
              </>,
            );
          },
        );
      } else {
        console.log("Ethereum object doesn't exist!");
      }
    } catch (error) {
      console.log(error);
    }
  }, []);

  function getContract(ethereum: any) {
    const provider = new ethers.providers.Web3Provider(ethereum);
    const signer = provider.getSigner();
    const wavePortalContract = new ethers.Contract(
      contractAddress,
      contractABI,
      signer,
    );

    return wavePortalContract;
  }

  async function requestArt(event: any) {
    event.preventDefault();

    const { ethereum } = window;

    if (!ethereum) {
      toast.error(getMissingMetamaskMessage());
      return;
    }

    if (!message || message.length === 0) {
      toast.warn(
        'You need to specify a message before requesting to view a picture',
      );
      return;
    }

    const contract = getContract(ethereum);
    mineTransaction(contract, message);
  }

  async function connectWallet() {
    try {
      const { ethereum } = window;

      if (!ethereum) {
        toast.error(getMissingMetamaskMessage());
        return;
      }

      const accounts = await ethereum.request({
        method: 'eth_requestAccounts',
      });

      getArtRequests();
    } catch (error: any) {
      console.log(error);

      if (
        error.message.includes(
          `Request of type 'wallet_requestPermissions' already pending`,
        )
      ) {
        toast.info(
          `You've already requested to connect your Metamask wallet. Click on the Metamask wallet extension to bring it back to focus so you can connect your wallet.`,
        );
      } else if (error.message.includes(`User rejected the request.`)) {
        toast.info(`That's so sad. You decided to not connect your wallet. 😭`);
      } else {
        toast.error('An unknown error occurred');
      }
    }
  }

  const checkIfWalletIsConnected = async (ethereum: any) => {
    try {
      const [account] = await ethereum.request({ method: 'eth_accounts' });

      if (account) {
        console.log('Found an authorized account:', account);
        setCurrentAccount(account);
      }
    } catch (error) {
      console.dir(error);
      toast.error('An unknown error occurred connecting your account.');
    }
  };

  /*
   * This runs our function when the page loads.
   */
  useEffect(() => {
    const { ethereum } = window;

    if (!ethereum) {
      toast.error(getMissingMetamaskMessage());
      return;
    }

    ethereum.on('accountsChanged', ([account]: Array<string>) => {
      if (account) {
        // We're only interested in the first account for now
        // to keep things simple
        setCurrentAccount(account);
        toast.info(`Wallet ${account} has been connected`);
      } else {
        setCurrentAccount(null);
        toast.warn(
          'No authorized account found. Connect your account in your Metamask wallet.',
        );
      }
    });

    checkIfWalletIsConnected(ethereum);
    getArtRequests();
    document.querySelector('.Toastify')?.setAttribute('aria-live', 'polite');
  }, [getArtRequests]);

  return (
    <>
      <header sx={{ margin: '1rem 0' }}>
        <marquee
          sx={{
            fontSize: '2rem',
            background: '#000',
            color: 'lime',
            padding: '0.5rem',
          }}
        >
          {currentAccount
            ? `${artRequests.length} picture requests 👏🏻`
            : 'Connect your wallet 😎'}
        </marquee>
        <h1 sx={{ fontFamily: 'heading' }}>
          Welcome to the <span sx={{ color: 'accent' }}>picture portal 📷</span>
        </h1>
      </header>
      <main>
        <ToastContainer position="top-right" theme="dark" />
        <p>
          <em>Hi! 👋</em> I&apos;m Nick. Connect your Metamask Ethereum wallet
          and request to see some pictures! (not purchase an NFT). Note that
          this is a test dApp.
        </p>
        <div
          sx={{
            display: 'flex',
            flexDirection: 'column',
            marginBottom: '1rem',
          }}
        >
          <div sx={{ margin: '1rem 0' }}>
            {currentAccount ? (
              <span
                sx={{
                  background: '#000',
                  color: '#fff',
                  fontWeight: 500,
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  marginRight: '0.5rem',
                }}
              >
                Account: <EtherscanLink address={currentAccount} />
              </span>
            ) : (
              <Button onClick={connectWallet}>Connect Wallet</Button>
            )}
          </div>
          <form>
            <input
              required={true}
              type="text"
              value={message}
              placeholder="Message"
              onChange={(e) => setMessage(e.target.value)}
              sx={{ marginRight: '0.5rem' }}
            />
            <Button type="submit" onClick={requestArt}>
              Send message
            </Button>
          </form>
        </div>

        {artRequests.length > 0 && (
          <ul
            sx={{
              listStyle: 'none',
              overflowX: 'hidden',
              overflowY: 'scroll',
              height: '50vh',
              padding: '1rem',
              '& li': {
                borderRadius: '0.5rem',
                backgroundImage: `linear-gradient(to right top, #d8ff10, #ffb900, #ff5843, #ff0099, #c312eb)`,
                padding: '1rem',
              },
              '& details': {
                display: 'flex',
                flexDirection: 'column',
                fontWeight: 500,
                padding: '1rem',
                background: '#000',
                color: '#fff',
                borderRadius: '0.5rem',
              },
              '& li + li': {
                marginTop: '1rem',
              },
            }}
          >
            {artRequests.map((messageRequest: MessageRequest, index, items) => {
              const otherProps =
                index === items.length - 1
                  ? {
                      ref: lastMessageRef,
                      id: `message${index}`,
                    }
                  : {};
              return (
                <li key={index}>
                  <MessageCard
                    messageRequest={messageRequest}
                    {...otherProps}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <footer>
        <nav>
          <ul
            sx={{
              listStyle: 'none',
              display: 'flex',
              margin: 0,
              justifyContent: 'space-between',
              '& li + li': {
                paddingLeft: '1rem',
              },
            }}
          >
            <li>
              <a href="https://github.com/nickytonline/picture-portal">
                source code
              </a>
            </li>
            <li>
              <a href="https://timeline.iamdeveloper.com">about Nick</a>
            </li>
          </ul>
        </nav>
      </footer>
    </>
  );
};

export default Home;
