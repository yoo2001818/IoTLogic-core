(display "Payload reloading")
(newline)
; Just some sugaring
(define (stringify x)
  (cond
    ((string? x) x)
    ((symbol? x) (symbol->string x))
    ((number? x) (number->string x))
    ((boolean? x) (if x "#t" "#f"))
    (else "")
  )
)

(define (notify target message)
  (io-exec (list target 'notifier/send) message)
)

(define require (case-lambda
  ((name) (io-exec 'require name))
  ((target name) (io-exec
    (list target 'require) name
  ))
))

(define (start-wiringPi target)
  (io-exec (list target 'require) "wiring-pi")
  (io-exec (list target 'wiringPi/setup) '(wpi))
)

; Test entry point
(require 'server "process")
; No escaping yet! We need it though.
(define (confirm target message callback)
  (io-exec
    (list target 'process/exec)
    (string-append "zenity --question --text \""
      message
      "\""
    )
    (lambda (err)
      (if (null? err)
        (callback #t)
        (callback #f)
      )
    )
  )
)
(define ARROW-PIN 1)

(define INPUT-PIN 15)
(define LED-PIN 16)
(start-wiringPi 'client)
(io-exec 'client:wiringPi/pinMode (list INPUT-PIN 'input))
(io-exec 'client:wiringPi/pinMode (list LED-PIN 'output))

(io-exec 'client:wiringPi/pinMode (list ARROW-PIN 'input))
; Turn off the LED for init
(io-exec 'client:wiringPi/digitalWrite (list LED-PIN #f))
(let ((pressed #f) (ledOn #f) (arrowPressed #f) (askToggle '()))
  ; letrec is not implemented yet
  (set! askToggle (lambda (message final)
    (confirm 'server message (lambda (result)
      (if result (begin
        (io-exec 'client:wiringPi/digitalWrite (list LED-PIN final))
        (set! ledOn final)
        (display (string-append "LED status set to " (if final "ON" "OFF")))
      ))
    ))
  ))
  (io-on 'client:timer 50 (lambda ()
    (io-exec 'client:wiringPi/digitalRead (list INPUT-PIN) (lambda (status)
      (if (not (eq? pressed status)) (begin
        (set! pressed status)
        (if (= status 1)
          (begin
            (display "Button triggered")
            (askToggle (if ledOn
              "LED를 꺼달라고 요청이 왔습니다. 끌까요?"
              "LED를 켜달라고 요청이 왔습니다. 켤까요?"
            ) (not ledOn))
          )
        )
      ))
    ))
    (io-exec 'client:wiringPi/digitalRead (list ARROW-PIN) (lambda (status)
      (if (not (eq? arrowPressed status)) (begin
        (set! arrowPressed status)
        (if (= status 1) (io-exec 'server:process/exec "xdotool key Right"))
      ))
    ))
  ))
)
