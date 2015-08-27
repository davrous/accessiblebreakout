declare var meSpeak: any;

module BrikBrok {
    // Number of rows & columns for the game
    export const BRICKS_ROWS = 3;
    export const BRICKS_COLS = 8;
    // Size of the SVG bricks (in pixels)
    export const BRICK_WIDTH = 180;
    export const BRICK_HEIGHT = 80;
    // To help blind user, the sound is being played at normal rate
    // on 66% of the global width. It's to help them anticipating the ball
    export const ACCESSIBLE_PAD_TOLERANCE = 0.66;
    export const DEFAULT_MUSIC_PLAYRATE = 1.3;
    export const DEFAULT_PADDLE_WIDTH = 150;
    export const ACCESSIBLE_PADDLE_WIDTH = 300;
    export const DEFAULT_BALL_SPEED = 4;
    export const ACCESSIBLE_BALL_SPEED = 3;

    export class Game {
        private _pad;
        private _ball;
        public svg;
        private _message;

        private _ballRadius: number;
        private _ballX: number = 0;
        private _ballY: number = 0;
        private _previousBallPosition = { x: 0, y: 0 };
        private _ballDirectionX: number;
        private _ballDirectionY: number;
        private _ballSpeed = 3;

        private _viewPortWidth = 0;
        private _viewPortHeight = 0;
        private _viewPortCenter = {x:0, y:0};

        // Pad
        private _padWidth: number;
        private _padHeight: number;
        private _padX;
        private _padY;
        private _padSpeed = 0;
        public inertia = 0.80;

        // Bricks
        private _bricks: Brick[] = [];
        private _bricksCount = 0;
        public destroyedBricksCount;
        private _bricksMargin = 15;
        private _bricksTop = 20;

        // Misc.
        private _minX;
        private _minY;
        private _maxX;
        private _maxY;
        private _startDate;

        public audioAccessibility = true;
        public visuallyImpaired = true;

        public gameStarted = false;
        private _rafID;

        private _renderCanvas: HTMLCanvasElement;
        private _engine: BABYLON.Engine;
        private _camera: BABYLON.Camera;
        private _scene: BABYLON.Scene;

        private _music: BABYLON.Sound;
        private _jumpSound: BABYLON.Sound;

        private _chkVisualImpaired: HTMLInputElement;
        private _chkAudioAccessibility: HTMLInputElement;
        private _gameButton;

        constructor() {
            // Accessing DOM elements
            this._pad = document.getElementById("pad");
            this._ball = document.getElementById("ball");
            this.svg = document.getElementById("svgRoot");
            this._message = document.getElementById("message");
            this._chkVisualImpaired = <HTMLInputElement>document.getElementById("chkVisualImpaired");
            this._chkAudioAccessibility = <HTMLInputElement>document.getElementById("chkAudioAccessibility");
            this._renderCanvas = <HTMLCanvasElement>document.getElementById("backgroundCanvas");
            this._gameButton = document.getElementById("newGame");

            this._gameButton.addEventListener("click", () => {
                if (this.gameStarted) {
                    this._gameButton.value = "Start game";
                    this.stopGame();
                }
                else {
                    this._gameButton.value = "Stop game";
                    this.startGame();
                }
            });
            this._chkVisualImpaired.addEventListener("change", () => {
                this.visuallyImpaired = this._chkVisualImpaired.checked;
                if (!this.gameStarted) {
                    this.initGame();
                }
            });
            this._chkAudioAccessibility.addEventListener("change", () => {
                this.audioAccessibility = this._chkAudioAccessibility.checked;
                if (!this.gameStarted) {
                    this.initGame();
                }
            });

            this._ballRadius = this._ball.r.baseVal.value;
            this._minX = this._ballRadius;
            this._minY = this._ballRadius;
            this._viewPortWidth = this.svg.viewBox.baseVal.width;
            this._viewPortHeight = this.svg.viewBox.baseVal.height;
            this._viewPortCenter = { x: this._viewPortWidth / 2, y: this._viewPortHeight / 2 };

            this._connectWindowHandlers();

            if (BABYLON.Engine.isSupported()) {
                this._initBabylonEngine();
                this._initSounds();
            }

            meSpeak.loadConfig("mespeak_config.json");
            meSpeak.loadVoice("voices/en/en.json");
        }

        private _connectWindowHandlers() {
            window.addEventListener('keydown',(evt) => {
                switch (evt.keyCode) {
                    // Left arrow
                    case 37:
                        this._padSpeed -= 10;
                        break;
                    // Right arrow   
                    case 39:
                        this._padSpeed += 10;
                        break;
                }
            }, true);

            window.onresize = () => {
                this._renderCanvas.width = window.innerWidth;
                this._renderCanvas.height = window.innerHeight - 100;
                this._engine.resize();
            };
        }

        private _initBabylonEngine() {
            this._renderCanvas.width = window.innerWidth;
            this._renderCanvas.height = window.innerHeight - 100;

            this._engine = new BABYLON.Engine(this._renderCanvas, true);
            this._scene = new BABYLON.Scene(this._engine);
            var light = new BABYLON.DirectionalLight("light", new BABYLON.Vector3(2, -10, 5), this._scene);
            this._camera = new BABYLON.ArcRotateCamera("camera", 3 * Math.PI / 2.0, Math.PI / 4.0, 20.0, new BABYLON.Vector3(0, 0, 0), this._scene);

            // Starfield
            var starfield = new BABYLON.ParticleSystem("particles", 4000, this._scene);
            starfield.particleTexture = new BABYLON.Texture("assets/star.png", this._scene);
            starfield.minAngularSpeed = -4.5;
            starfield.maxAngularSpeed = 4.5;
            starfield.minSize = 0.5;
            starfield.maxSize = 1.0;
            starfield.minLifeTime = 0.5;
            starfield.maxLifeTime = 2.0;
            starfield.minEmitPower = 0.5;
            starfield.maxEmitPower = 1.0;
            starfield.emitRate = 600;
            starfield.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
            starfield.minEmitBox = new BABYLON.Vector3(-25, 0, -25);
            starfield.maxEmitBox = new BABYLON.Vector3(25, 0, 25);
            starfield.direction1 = new BABYLON.Vector3(0, 1, 0);
            starfield.direction2 = new BABYLON.Vector3(0, 1, 0);
            starfield.color1 = new BABYLON.Color4(0, 0, 0, 1);
            starfield.color2 = new BABYLON.Color4(1, 1, 1, 1);
            starfield.gravity = new BABYLON.Vector3(0, 5, 0);
            starfield.emitter = new BABYLON.Vector3(0, -2, 0);
            starfield.start();

            this._engine.runRenderLoop(() => {
                // If you're completely blind or don't have any visual deficiency 
                if (!this.visuallyImpaired) {
                    this._scene.render();
                }
                // If you have visual deficiencies, we're not rendering the star field 
                // and render a black frame as background
                else {
                    this._engine.clear(BABYLON.Color3.Black(), true, true);
                }
            });
        }

        private _initSounds() {
            // You need a Web Audio compatible browser
            if (BABYLON.Engine.audioEngine.canUseWebAudio) {
                var assetsManager = new BABYLON.AssetsManager(this._scene);

                var binaryTask = assetsManager.addBinaryFileTask("music task", "/sounds/techno.wav");
                binaryTask.onSuccess = (task: any) => {
                    this._music = new BABYLON.Sound("Music", task.data, this._scene, null, { loop: true, spatialSound: true });
                };

                var binaryTask = assetsManager.addBinaryFileTask("jump task", "/sounds/jump.mp3");
                binaryTask.onSuccess = (task: any) => {
                    this._jumpSound = new BABYLON.Sound("Jump", task.data, this._scene, null, { spatialSound: true });
                };

                assetsManager.load();
            }
            else {
                // Creating empty sounds as fallback
                this._music = new BABYLON.Sound("Music", null, this._scene);
                this._jumpSound = new BABYLON.Sound("Jump", null, this._scene);
            }
        }

        // Collisions
        private _collideWithWindow() {
            if (this._ballX < this._minX) {
                this._ballX = this._minX;
                this._ballDirectionX *= -1.0;
                this._playBallSound(2);
            }
            else if (this._ballX > this._maxX) {
                this._ballX = this._maxX;
                this._ballDirectionX *= -1.0;
                this._playBallSound(2);
            }

            if (this._ballY < this._minY) {
                this._ballY = this._minY;
                this._ballDirectionY *= -1.0;
                this._playBallSound(2);
            }
            else if (this._ballY > this._maxY) {
                this._ballY = this._maxY;
                this._ballDirectionY *= -1.0;
                this._lost();
            }
        }

        private _collideWithPad() {
            if (this._ballX + this._ballRadius < this._padX || this._ballX - this._ballRadius > this._padX + this._padWidth)
                return;

            if (this._ballY + this._ballRadius < this._padY)
                return;

            var tolerance = (this._ballRadius + this._ballY) - this._padY;

            if (tolerance >= 0 && tolerance <= 4) {
                this._playBallSound(0.5);

                this._ballX = this._previousBallPosition.x;
                this._ballY = this._previousBallPosition.y;

                this._ballDirectionY *= -1.0;

                var dist = this._ballX - (this._padX + this._padWidth / 2);

                this._ballDirectionX = 2.0 * dist / this._padWidth;

                var square = Math.sqrt(this._ballDirectionX * this._ballDirectionX + this._ballDirectionY * this._ballDirectionY);
                this._ballDirectionX /= square;
                this._ballDirectionY /= square;
            }
        }

        // Pad movement
        private _movePad() {
            this._padX += this._padSpeed;

            this._padSpeed *= this.inertia;

            if (this._padX < this._minX)
                this._padX = this._minX;

            if (this._padX + this._padWidth > this._maxX)
                this._padX = this._maxX - this._padWidth;
        }

        private _checkWindow() {
            this._maxX = this._viewPortWidth - this._minX;
            this._maxY = this._viewPortHeight - this._minY;
            this._padY = this._maxY - 30;
        }

        private _gameLoop() {
            this._movePad();

            var currentBallSpeed = this._ballSpeed;

            // If audio accessibility is being used, we're slowing down the ball speed 
            // in the last 20% of the vertical screen
            if (this.audioAccessibility && this._ballY > this._viewPortHeight * 0.8) {
                currentBallSpeed /= 2;
            }

            // Movements
            this._previousBallPosition.x = this._ballX;
            this._previousBallPosition.y = this._ballY;
            this._ballX += this._ballDirectionX * currentBallSpeed;
            this._ballY += this._ballDirectionY * currentBallSpeed;

            // Collisions
            this._collideWithWindow();
            this._collideWithPad();

            // Bricks
            for (var index = 0; index < this._bricks.length; index++) {
                if (this._bricks[index].drawAndCollide(this._ballX, this._ballY, this._ballRadius, BRICK_WIDTH, BRICK_HEIGHT)) {
                    this.destroyedBricksCount++;
                    this._bricksCount--;
                    if (this._bricksCount > 0 && BABYLON.Engine.audioEngine.canUseWebAudio && this.audioAccessibility) {
                        meSpeak.speak(this._bricksCount + ", remaining", { amplitude: 100, wordgap: 0, pitch: 50, speed: 150, variant: "none" });
                    }

                    this._playBallSound();

                    // Updating ball
                    this._ballX = this._previousBallPosition.x;
                    this._ballY = this._previousBallPosition.y;

                    this._ballDirectionY *= -1.0;
                }
            }

            if (this._bricksCount < 10) {
                console.log();
            }

            // Ball
            this._ball.setAttribute("cx", this._ballX);
            this._ball.setAttribute("cy", this._ballY);

            // Pad
            this._pad.setAttribute("x", this._padX);
            this._pad.setAttribute("y", this._padY);

            if (this.gameStarted) {
                if (this.audioAccessibility) {
                    this._updateAccessibilityMusic();
                }
                this._rafID = requestAnimationFrame(() => { this._gameLoop(); });
            }

            // Victory ?
            if (this.destroyedBricksCount == this._bricks.length) {
                this._win();
            }
        }

        private _updateAccessibilityMusic() {
            var paddleX = this._padX;
            var paddleW = this._padWidth;
            var ballPosition = { x: this._ballX, y: this._ballY };

            var deltaX = paddleW * ((1 - ACCESSIBLE_PAD_TOLERANCE) / 2);

            if (ballPosition.x > deltaX + 10 && ballPosition.x < this._viewPortWidth - (deltaX + 10)) {
                paddleX += paddleW * ((1 - ACCESSIBLE_PAD_TOLERANCE) / 2);
                paddleW = paddleW * ACCESSIBLE_PAD_TOLERANCE;
            }

            // If paddle & ball aligned, sound is played on both ears (X = 0, for center)
            // If the ball is on the left, musicIndicatorX should be negative otherwise positive
            var musicIndicatorX;

            // Position coordinates are in normalized canvas coordinates
            // with -0.5 < x, y < 0.5
            if (ballPosition) {
                var x = (ballPosition.x - this._viewPortCenter.x) / this._viewPortWidth;

                // Ball and paddle are vertically aligned
                if (ballPosition.x >= paddleX && ballPosition.x <= paddleX + paddleW) {
                    this._music.setPlaybackRate(DEFAULT_MUSIC_PLAYRATE)
                    musicIndicatorX = 0;
                }
                else {
                    var distanceFromPaddle;
                    // Ball is on the left of the paddle
                    if (ballPosition.x < paddleX) {
                        distanceFromPaddle = paddleX - ballPosition.x;
                        musicIndicatorX = -30;
                    }
                    else {
                        distanceFromPaddle = ballPosition.x - paddleX - paddleW;
                        musicIndicatorX = 30;
                    }
                    var distanceFromPaddleNormalized = distanceFromPaddle / this._viewPortWidth;
                    // Slowing down the play rate based on the distance from the paddle
                    this._music.setPlaybackRate(0.9 * (1 - distanceFromPaddleNormalized));
                }
                // Playing music on left or right speaker based on the ball position from the paddle
                this._music.setPosition(new BABYLON.Vector3(musicIndicatorX, 0.5, 0));
            }
        }

        private _playBallSound(playSpeed?: number) {
            var playrate = playSpeed || 1.0;
            var x = (this._ballX - this._viewPortCenter.x) / this._viewPortWidth;
            var y = (this._ballY - this._viewPortCenter.y) / this._viewPortHeight;
            this._jumpSound.setPosition(new BABYLON.Vector3(x * 40, y * 40, 0));
            this._jumpSound.setPlaybackRate(playrate);
            this._jumpSound.play();
        }

        private _generateBricks() {
            // Removing previous ones
            for (var index = 0; index < this._bricks.length; index++) {
                this._bricks[index].remove();
            }

            // Creating new ones
            var brickID = 0;

            var offset = (this._viewPortWidth - BRICKS_COLS * (BRICK_WIDTH + this._bricksMargin)) / 2.0;

            for (var x = 0; x < BRICKS_COLS; x++) {
                for (var y = 0; y < BRICKS_ROWS; y++) {
                    this._bricks[brickID++] = new Brick(this, offset + x * (BRICK_WIDTH + this._bricksMargin), y * (BRICK_HEIGHT + this._bricksMargin) + this._bricksTop, x + 1);
                }
            }

            this._bricksCount = brickID;
        }

        private _lost() {
            this._music.stop();
            this.gameStarted = false;
            this._gameButton.innerHTML = "Start game";

            if (BABYLON.Engine.audioEngine.canUseWebAudio && this.audioAccessibility) {
                meSpeak.speak("Game over!", { amplitude: 100, wordgap: 0, pitch: 50, speed: 150, variant: "none" });
            }
            this._message.innerHTML = "Game over !";
            this._message.style.visibility = "visible";
        }

        private _win() {
            this._music.stop();
            this.gameStarted = false;
            this._gameButton.innerHTML = "Start game";

            var end = (new Date).getTime();

            this._message.innerHTML = "Victory ! (" + Math.round((end - this._startDate) / 1000) + "s)";
            if (BABYLON.Engine.audioEngine.canUseWebAudio && this.audioAccessibility) {
                meSpeak.speak("Victory ! In " + Math.round((end - this._startDate) / 1000) + " seconds", { amplitude: 100, wordgap: 0, pitch: 50, speed: 150, variant: "none" });
            }

            this._message.style.visibility = "visible";
        }

        public initGame() {
            if (this.audioAccessibility) {
                this._pad.width.baseVal.value = ACCESSIBLE_PADDLE_WIDTH;
                this._ballSpeed = ACCESSIBLE_BALL_SPEED;
            }
            else {
                this._pad.width.baseVal.value = DEFAULT_PADDLE_WIDTH;
                this._ballSpeed = DEFAULT_BALL_SPEED;
            }

            if (this.visuallyImpaired) {
                loadStyleSheet('/css/indexvi.css', null, this);
            }
            else {
                loadStyleSheet('/css/index.css', null, this);
            }

            this._padWidth = this._pad.width.baseVal.value;
            this._padHeight = this._pad.height.baseVal.value;
            this._message.style.visibility = "hidden";

            this._checkWindow();

            this._padX = (this._viewPortWidth - this._padWidth) / 2.0;
            this._ballX = this._viewPortWidth / 2.0;
            this._ballY = this._maxY - 60;
            this._previousBallPosition.x = this._ballX;
            this._previousBallPosition.y = this._ballY;
            this._padSpeed = 0;

            this._ballDirectionX = Math.random();
            this._ballDirectionY = -1.0;

            this._generateBricks();
            this._gameLoop();
        }

        public stopGame() {
            cancelAnimationFrame(this._rafID);
            this.gameStarted = false;
            this._music.stop();
            this.initGame();
        }

        public startGame() {
            cancelAnimationFrame(this._rafID);

            if (BABYLON.Engine.audioEngine.canUseWebAudio && this.audioAccessibility) {
                meSpeak.speak("Starting game", { amplitude: 100, wordgap: 0, pitch: 50, speed: 150, variant: "none" });
            }

            this.initGame();
            this.gameStarted = true;
            this._music.setPlaybackRate(DEFAULT_MUSIC_PLAYRATE);
            this._music.play();
            
            this.destroyedBricksCount = 0;

            this._startDate = (new Date()).getTime();;
            this._rafID = requestAnimationFrame(() => { this._gameLoop(); });
        }
    }

    export class Brick {
        private _isDead = false;
        private _position;
        private _rect;
        private _currentGame;

        constructor(currentGame: Game, x: number, y: number, col: number) {
            this._currentGame = currentGame;
            this._position = { x: x, y: y, col: col };

            this._rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            currentGame.svg.appendChild(this._rect);

            this._rect.setAttribute("width", BRICK_WIDTH.toString());
            this._rect.setAttribute("height", BRICK_HEIGHT.toString());

            if (!currentGame.visuallyImpaired) {
                // Random green color
                var chars = "456789abcdef";
                var color = "";
                for (var i = 0; i < 2; i++) {
                    var rnd = Math.floor(chars.length * Math.random());
                    color += chars.charAt(rnd);
                }
                this._rect.setAttribute("fill", "#00" + color + "00");
            }
            else {
                this._rect.setAttribute("fill", "Yellow");
            }
        }

        public drawAndCollide(ballX: number, ballY: number, ballRadius: number, brickWidth: number, brickHeight: number): boolean {
            if (this._isDead)
                return false;
            // Drawing
            this._rect.setAttribute("x", this._position.x);
            this._rect.setAttribute("y", this._position.y);

            // Collision
            if (ballX + ballRadius < this._position.x || ballX - ballRadius > this._position.x + brickWidth)
                return false;

            if (ballY + ballRadius < this._position.y || ballY - ballRadius > this._position.y + brickHeight)
                return false;

            // Dead
            this.remove();
            this._isDead = true;
            return true;
        }

        public remove() {
            if (this._isDead)
                return;
            this._currentGame.svg.removeChild(this._rect);
        }
    }
}

function loadStyleSheet(path, fn, scope) {
    var head = document.getElementsByTagName('head')[0], // reference to document.head for appending/ removing link nodes
        link = document.createElement('link');           // create the link node
    link.setAttribute('href', path);
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('type', 'text/css');

    var sheet, cssRules;
    // get the correct properties to check for depending on the browser
    if ('sheet' in link) {
        sheet = 'sheet'; cssRules = 'cssRules';
    }
    else {
        sheet = 'styleSheet'; cssRules = 'rules';
    }

    var interval_id = setInterval(function () {                    // start checking whether the style sheet has successfully loaded
        try {
            if (link[sheet] && link[sheet][cssRules].length) { // SUCCESS! our style sheet has loaded
                clearInterval(interval_id);                     // clear the counters
                clearTimeout(timeout_id);
                fn.call(scope || window, true, link);           // fire the callback with success == true
            }
        } catch (e) { } finally { }
    }, 10),                                                   // how often to check if the stylesheet is loaded
        timeout_id = setTimeout(function () {       // start counting down till fail
            clearInterval(interval_id);            // clear the counters
            clearTimeout(timeout_id);
            head.removeChild(link);                // since the style sheet didn't load, remove the link node from the DOM
            fn.call(scope || window, false, link); // fire the callback with success == false
        }, 15000);                                 // how long to wait before failing

    head.appendChild(link);  // insert the link node into the DOM and start loading the style sheet

    return link; // return the link node;
}