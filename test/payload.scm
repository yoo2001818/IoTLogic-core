(display "Payload reloading")
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
  (io-exec (string-append (stringify target) ":notifier/send") message)
)

(define require (case-lambda
  ((name) (io-exec 'require name))
  ((target name) (io-exec
    (string-append (stringify target) ":require") name
  ))
))
