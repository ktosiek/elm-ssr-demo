module Main exposing (main)

import Browser
import Html exposing (Html)
import Html.Attributes exposing (src)
import Html.Events exposing (onClick)
import Http
import Json.Decode as Decode


catApiUrl =
    "https://api.thecatapi.com/v1/images/search?"


type Msg
    = GotCat (Result Http.Error Model)
    | MoreCat


type alias CatId =
    String


type alias Url =
    String


type Model
    = Loading
    | Cat (String -> String) CatId Url


main : Platform.Program {} Model Msg
main =
    Browser.document
        { init = \_ -> ( Loading, getCat )
        , update = update
        , view = \m -> { title = "It's a cat!", body = [ showCat m ] }
        , subscriptions = \_ -> Sub.none
        }


update msg model =
    case msg of
        GotCat (Ok cat) ->
            ( cat, Cmd.none )

        GotCat (Err err) ->
            Debug.todo "Bad cat"

        MoreCat ->
            ( model, getCat )


getCat : Cmd Msg
getCat =
    Http.get catApiUrl firstCatDecoder
        |> Http.send GotCat
        |> Debug.log "Getting cats =^_^="


firstCatDecoder : Decode.Decoder Model
firstCatDecoder =
    Decode.list catDecoder
        |> Decode.andThen
            (List.head
                >> Maybe.map Decode.succeed
                >> Maybe.withDefault (Decode.fail "No cats :-C")
            )


catDecoder : Decode.Decoder Model
catDecoder =
    Decode.map2 (Cat showCatId)
        (Decode.field "id" Decode.string)
        (Decode.field "url" Decode.string)


showCatId : String -> String
showCatId catId =
    getId 1 ++ ": " ++ catId


getId x =
    if x == 0 then
        "ID"

    else
        "I" ++ getId (x - 1)


showCat : Model -> Html Msg
showCat model =
    case model of
        Loading ->
            Html.text (showCatId "Loading...")

        Cat f catId url ->
            Html.figure [ onClick MoreCat ]
                [ Html.img [ src url ] []
                , Html.figcaption [] [ Html.text (f catId) ]
                ]
